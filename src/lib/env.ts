function requireServerEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
const programAdminAuthority = process.env.NEXT_PUBLIC_PROGRAM_ADMIN_AUTHORITY;

if (!rpcUrl) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_RPC_URL");
}

if (!programId) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_PROGRAM_ID");
}

if (!programAdminAuthority) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_PROGRAM_ADMIN_AUTHORITY");
}

export const env = {
    rpcUrl,
    programId,
    programAdminAuthority,
};

export function getIndexerUrl(): string {
    return requireServerEnv("INDEXER_URL");
}
