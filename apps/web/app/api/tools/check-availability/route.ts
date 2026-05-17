import { NextResponse, type NextRequest } from "next/server";
import { handleCheckAvailability } from "@ai-receptionist/backend/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = handleCheckAvailability(body);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      {
        code: "validation_failed",
        callerSafeMessage:
          "Nie mogę teraz sprawdzić wolnych terminów. Łączę z kimś z zespołu.",
      },
      { status: 400 },
    );
  }
}
