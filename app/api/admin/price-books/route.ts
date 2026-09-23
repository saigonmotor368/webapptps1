import { NextRequest, NextResponse } from "next/server";
import { getCustomerSupabaseAdmin } from "@/lib/customer-supabase-server";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const kind = searchParams.get("kind");

    const supabase = getCustomerSupabaseAdmin();
    let query = supabase.from("price_books").select("*").order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (kind) query = query.eq("kind", kind);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const session = auth.profile;
    
    // Check role, only certain roles can create
    const userRole = session.role;
    if (!["admin", "truong_phong", "ke_toan", "thu_mua"].includes(userRole || "")) {
       return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const { code, name, kind, allow_unlisted_products, rounding_rule } = body;

    if (!code || !name || !kind) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = getCustomerSupabaseAdmin();
    const { data, error } = await supabase
      .from("price_books")
      .insert({
        code,
        name,
        kind,
        status: "draft",
        allow_unlisted_products: allow_unlisted_products ?? true,
        rounding_rule: rounding_rule ?? "nearest_100",
        created_by: session.email || "system",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
