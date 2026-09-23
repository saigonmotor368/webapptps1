import { NextRequest, NextResponse } from "next/server";
import { getCustomerSupabaseAdmin } from "@/lib/customer-supabase-server";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const session = auth.profile;
    
    // Only admins or managers can assign price books
    const userRole = session.role;
    if (!["admin", "truong_phong", "ceo"].includes(userRole || "")) {
       return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { customer_ids, valid_from, valid_to, priority } = body;

    if (!customer_ids || !Array.isArray(customer_ids)) {
      return NextResponse.json({ error: "customer_ids array is required" }, { status: 400 });
    }

    const supabase = getCustomerSupabaseAdmin();
    
    const insertData = customer_ids.map(customerId => ({
      price_book_id: id,
      customer_id: customerId,
      valid_from: valid_from || null,
      valid_to: valid_to || null,
      priority: priority || 1,
      created_by: session.email
    }));

    const { data, error } = await supabase
      .from("price_book_customer_assignments")
      .insert(insertData)
      .select();

    if (error) throw error;
    
    // Log audit
    await supabase.from("price_book_audit_logs").insert({
      price_book_id: id,
      action: "ASSIGN_CUSTOMERS",
      performed_by: session.email,
      details: { customer_ids, valid_from, valid_to }
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
