import { NextRequest, NextResponse } from "next/server";
import { getCustomerSupabaseAdmin } from "@/lib/customer-supabase-server";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getCustomerSupabaseAdmin();
    
    const { data: priceBook, error: pbError } = await supabase
      .from("price_books")
      .select("*")
      .eq("id", id)
      .single();

    if (pbError) throw pbError;

    const { data: items, error: itemsError } = await supabase
      .from("price_book_items")
      .select("*")
      .eq("price_book_id", id);

    if (itemsError) throw itemsError;

    return NextResponse.json({ data: { ...priceBook, items } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const session = auth.profile;
    
    const userRole = session.role;
    const { id } = await params;
    const body = await req.json();
    const { status, name, allow_unlisted_products, valid_from, valid_to } = body;

    const supabase = getCustomerSupabaseAdmin();
    
    // Authorization checks based on status changes
    if (status) {
      if (status === "active" && userRole !== "admin" && userRole !== "ceo") {
        return NextResponse.json({ error: "Chỉ CEO hoặc Admin mới được duyệt và kích hoạt bảng giá." }, { status: 403 });
      }
      
      if (status === "active") {
        body.approved_by = session.email;
      }
    }

    const { data, error } = await supabase
      .from("price_books")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    
    // Log audit
    await supabase.from("price_book_audit_logs").insert({
      price_book_id: id,
      action: "UPDATE",
      performed_by: session.email,
      details: body
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
