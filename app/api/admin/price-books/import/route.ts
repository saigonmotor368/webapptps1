import { NextRequest, NextResponse } from "next/server";
import { getCustomerSupabaseAdmin } from "@/lib/customer-supabase-server";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const session = auth.profile;

    const userRole = session.role;
    if (!["admin", "truong_phong", "ke_toan"].includes(userRole || "")) {
       return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const { price_book_id, rows, action } = body; // action: 'preview' or 'commit'

    if (!price_book_id || !Array.isArray(rows)) {
      return NextResponse.json({ error: "price_book_id and rows are required" }, { status: 400 });
    }

    const supabase = getCustomerSupabaseAdmin();
    
    // Check price book status
    const { data: priceBook, error: pbError } = await supabase
      .from("price_books")
      .select("status")
      .eq("id", price_book_id)
      .single();
      
    if (pbError || !priceBook) {
      return NextResponse.json({ error: "Price book not found" }, { status: 404 });
    }
    
    if (priceBook.status !== "draft" && priceBook.status !== "pending_approval") {
      return NextResponse.json({ error: "Only draft or pending price books can be updated via import" }, { status: 400 });
    }

    // Process rows against products DB
    const { data: allProducts } = await supabase.from("products").select("id, sku, name, unit, active");
    
    const processedRows = rows.map((row: any, index: number) => {
      let matchedProduct = null;
      let validationStatus = "invalid";
      let errors: string[] = [];

      // 1. Exact Match by SKU
      if (row.sku) {
        matchedProduct = allProducts?.find((p: any) => p.sku === row.sku);
      }
      
      // 2. Exact Match by Name & Unit
      if (!matchedProduct && row.name) {
        const potentialMatches = allProducts?.filter((p: any) => p.name.toLowerCase().trim() === row.name.toLowerCase().trim());
        if (potentialMatches && potentialMatches.length === 1) {
          matchedProduct = potentialMatches[0];
          if (row.unit && row.unit.toLowerCase() !== matchedProduct.unit.toLowerCase()) {
             errors.push("Unit mismatch");
          }
        } else if (potentialMatches && potentialMatches.length > 1) {
          validationStatus = "ambiguous";
          errors.push("Multiple products with same name");
        }
      }

      if (matchedProduct && validationStatus !== "ambiguous") {
        if (!matchedProduct.active) {
          validationStatus = "invalid";
          errors.push("Product is inactive");
        } else {
          validationStatus = "valid";
        }
      } else if (!matchedProduct) {
        validationStatus = "invalid";
        errors.push("Product not found");
      }

      // Check price logic
      if (row.price === undefined || row.price === null || row.price === "") {
        validationStatus = "blank-vs-zero";
        errors.push("Price is blank");
      } else if (parseFloat(row.price) < 0) {
        validationStatus = "invalid";
        errors.push("Price cannot be negative");
      }

      return {
        row_index: index,
        raw_data: row,
        matched_product_id: matchedProduct?.id || null,
        validation_status: validationStatus,
        validation_errors: errors
      };
    });

    if (action === "preview") {
      return NextResponse.json({ data: processedRows });
    }

    if (action === "commit") {
       // Create an import job
       const { data: job, error: jobError } = await supabase
         .from("price_book_import_jobs")
         .insert({
           price_book_id,
           status: "completed",
           created_by: session.email,
           stats: { total: rows.length, valid: processedRows.filter((r: any) => r.validation_status === 'valid').length }
         })
         .select()
         .single();
         
       if (jobError) throw jobError;

       // Insert valid items to price_book_items using upsert
       const validItemsToInsert = processedRows
         .filter((r: any) => r.validation_status === "valid" && r.matched_product_id)
         .map((r: any) => ({
           price_book_id,
           product_id: r.matched_product_id,
           price: parseFloat(r.raw_data.price),
           sku_snapshot: r.raw_data.sku,
           name_snapshot: r.raw_data.name,
           unit_snapshot: r.raw_data.unit
         }));

       if (validItemsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("price_book_items")
            .upsert(validItemsToInsert, { onConflict: "price_book_id, product_id" });
            
          if (insertError) throw insertError;
       }
       
       return NextResponse.json({ message: "Import committed successfully", job });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
