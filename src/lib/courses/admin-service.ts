import "server-only";
import { Prisma } from "@prisma/client";
import { verifyAdminSession } from "@/lib/admin/dal";
import { prisma } from "@/lib/db";

export class CoursePreparationError extends Error {}
export async function courseAdmin() {
  const session = await verifyAdminSession();
  if (!session) throw new CoursePreparationError("Admin authentication required");
  return session;
}
export async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && attempt < 2) {
        // Raw SELECT ... FOR UPDATE reports SQLSTATE through P2010; ordinary
        // Prisma writes report P2034. Retry only rolled-back conflicts.
        const adapter = error.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined;
        const sqlState = error.meta?.code ?? adapter?.cause?.originalCode;
        const rawConflict = error.code === "P2010" && ["40001", "40P01"].includes(String(sqlState));
        if (error.code === "P2034" || error.code === "P2002" || rawConflict) continue;
      }
      throw error;
    }
  }
}
