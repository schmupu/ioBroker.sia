// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            port: number;
            bind: string;
            timeout: number;
            sockend: boolean;
            path: string;
            save: boolean;
            keys: {
                accountnumber: string;
                aes: boolean;
                hex: boolean;
                password: string;
            };
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
