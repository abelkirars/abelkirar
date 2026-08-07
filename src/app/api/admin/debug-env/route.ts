import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/dal";

function describeEnv(value: string | undefined) {
    return {
        present: value !== undefined,
        blank: value !== undefined && value.length === 0,
        length: value?.length ?? 0,
    };
}

export async function GET() {
    const auth = await requireAdminApi();
    if ("response" in auth) return auth.response;

    const env = Object.fromEntries(
        Object.keys(process.env)
            .sort()
            .map((name) => [name, describeEnv(process.env[name])])
    );

    return NextResponse.json(
        {
            vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
            environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
            env,
        },
        {
            headers: {
                "Cache-Control": "no-store",
            },
        }
    );
}