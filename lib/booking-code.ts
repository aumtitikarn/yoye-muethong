import { prisma } from "@/lib/db";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Mirrors yoye-admin's booking code format: "YY-XXXXXX". */
export function randomBookingCode(): string {
  const random = Array.from({ length: 6 }, () =>
    CHARS.charAt(Math.floor(Math.random() * CHARS.length)),
  ).join("");
  return `YY-${random}`;
}

export async function generateUniqueBookingCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = randomBookingCode();
    const exists = await prisma.booking.findUnique({
      where: { bookingCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new Error("ไม่สามารถสร้างรหัสการจองได้");
}
