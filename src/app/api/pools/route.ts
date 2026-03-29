import { NextResponse } from "next/server";

import { getIndexerUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
    const response = await fetch(`${getIndexerUrl()}/pools`, { cache: "no-store" });
    const payload = await response.text();

    return new NextResponse(payload, {
        status: response.status,
        headers: {
            "content-type": response.headers.get("content-type") ?? "application/json",
        },
    });
}
