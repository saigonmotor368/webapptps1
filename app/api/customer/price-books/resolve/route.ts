import { NextRequest, NextResponse } from "next/server";
import { getCustomerSupabaseAdmin } from "@/lib/customer-supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderSessionToken, productIds: productIdsParam } = body;

    if (!orderSessionToken || !productIdsParam) {
      return NextResponse.json({ error: "orderSessionToken and productIds are required" }, { status: 400, headers: corsHeaders });
    }

    const supabase = getCustomerSupabaseAdmin();
    
    const { data: session, error: sessionError } = await supabase
      .from("customer_sessions")
      .select("customer_id")
      .eq("token", orderSessionToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn" }, { status: 401, headers: corsHeaders });
    }

    const customerId = session.customer_id;

    let productIds: string[] = [];
    if (Array.isArray(productIdsParam)) {
       productIds = productIdsParam;
    } else if (typeof productIdsParam === "string") {
       productIds = productIdsParam.split(",").map((id: string) => id.trim()).filter(Boolean);
    }
    if (productIds.length === 0) {
       return NextResponse.json({ data: [] }, { headers: corsHeaders });
    }

    productIds = [...new Set(productIds)].slice(0, 500);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (productIds.some((id) => !uuidPattern.test(id))) {
      return NextResponse.json({ error: "productIds không hợp lệ" }, { status: 400, headers: corsHeaders });
    }

    const nowDt = new Date();
    
    // 1. Get active general price book (fetch and filter by date)
    const { data: generalPbs } = await supabase
      .from("price_books")
      .select("id, valid_from, valid_to, created_at")
      .eq("kind", "general")
      .eq("status", "active");
      
    const validGeneralPbs = (generalPbs || []).filter((pb: any) => {
       if (pb.valid_from && new Date(pb.valid_from) > nowDt) return false;
       if (pb.valid_to && new Date(pb.valid_to) < nowDt) return false;
       return true;
    }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    const generalPb = validGeneralPbs.length > 0 ? validGeneralPbs[0] : null;

    // 2. Get customer specific active price book assignment
    const { data: custAssignments } = await supabase
      .from("price_book_customer_assignments")
      .select("price_book_id, priority, valid_from, valid_to, created_at, price_books!inner(status, valid_from, valid_to)")
      .eq("customer_id", customerId)
      .eq("price_books.status", "active");

    // Filter active assignments
    const validAssignments = (custAssignments || []).filter((a: any) => {
       const pb = a.price_books;
       if (a.valid_from && new Date(a.valid_from) > nowDt) return false;
       if (a.valid_to && new Date(a.valid_to) < nowDt) return false;
       if (pb.valid_from && new Date(pb.valid_from) > nowDt) return false;
       if (pb.valid_to && new Date(pb.valid_to) < nowDt) return false;
       return true;
    });

    // Sort by priority desc, created_at desc
    validAssignments.sort((a: any, b: any) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    
    const custAssignment = validAssignments.length > 0 ? validAssignments[0] : null;

    const result = [];

    // Optimize by fetching all needed items at once
    const pbIdsToFetch = [];
    if (generalPb) pbIdsToFetch.push(generalPb.id);
    if (custAssignment) pbIdsToFetch.push(custAssignment.price_book_id);

    if (pbIdsToFetch.length > 0) {
      const { data: pbItems, error: pbItemsError } = await supabase
        .from("price_book_items")
        .select("price_book_id, product_id, price, effective_from, effective_to")
        .in("price_book_id", pbIdsToFetch)
        .in("product_id", productIds);
        
      if (pbItemsError) throw pbItemsError;

      const validPbItems = (pbItems || []).filter((item: any) => {
        if (item.effective_from && new Date(item.effective_from) > nowDt) return false;
        if (item.effective_to && new Date(item.effective_to) < nowDt) return false;
        return true;
      });

      for (const productId of productIds) {
        let finalPrice = null;
        let priceSource = null;
        let priceBookId = null;

        // Try customer specific price first
        if (custAssignment) {
          const custPriceItem = validPbItems.find(
            (item: any) => item.price_book_id === custAssignment.price_book_id && item.product_id === productId
          );
          if (custPriceItem) {
            finalPrice = custPriceItem.price;
            priceSource = "customer_price_book";
            priceBookId = custAssignment.price_book_id;
          }
        }

        // Fallback to general price
        if (finalPrice === null && generalPb) {
          const generalPriceItem = validPbItems.find(
            (item: any) => item.price_book_id === generalPb.id && item.product_id === productId
          );
          if (generalPriceItem) {
            finalPrice = generalPriceItem.price;
            priceSource = custAssignment ? "general_fallback" : "general_price_book";
            priceBookId = generalPb.id;
          }
        }
        
        if (finalPrice !== null) {
           result.push({
             product_id: productId,
             price: finalPrice,
             price_source: priceSource,
             price_book_id: priceBookId
           });
        }
      }
    }

    return NextResponse.json({ data: result }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}
