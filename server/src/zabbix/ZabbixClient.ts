import { logger } from "../logger.js";

interface ZabbixRpcResponse<T> {
  jsonrpc: "2.0";
  result?: T;
  error?: { code: number; message: string; data?: string };
  id: number;
}

export interface ZabbixClientOptions {
  url: string;
  user: string;
  password: string;
  timeoutMs: number;
}

export class ZabbixClient {
  private authToken: string | null = null;
  private requestId = 1;

  constructor(private readonly options: ZabbixClientOptions) {}

  async login(): Promise<void> {
    this.authToken = await this.rpc<string>("user.login", {
      username: this.options.user,
      password: this.options.password
    }, false);
    logger.info("authenticated with zabbix api");
  }

  async version(): Promise<string> {
    return this.rpc<string>("apiinfo.version", {}, false);
  }

  async call<T>(method: string, params: unknown): Promise<T> {
    if (!this.authToken) {
      await this.login();
    }

    try {
      return await this.rpc<T>(method, params, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Session terminated") || message.includes("Not authorized")) {
        this.authToken = null;
        await this.login();
        return this.rpc<T>(method, params, true);
      }
      throw error;
    }
  }

  private async rpc<T>(method: string, params: unknown, withAuth: boolean): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const body = {
        jsonrpc: "2.0",
        method,
        params,
        id: this.requestId++
      };

      let response: Response;
      try {
        response = await fetch(this.options.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(withAuth && this.authToken ? { authorization: `Bearer ${this.authToken}` } : {})
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } catch (error) {
        if (error instanceof Error && (error.name === "AbortError" || error.message.includes("aborted"))) {
          throw new Error(`Tempo limite excedido ao consultar o Zabbix (${method}) apos ${Math.round(this.options.timeoutMs / 1000)}s`);
        }
        throw error;
      }

      if (!response.ok) {
        throw new Error(`Zabbix HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ZabbixRpcResponse<T>;
      if (payload.error) {
        throw new Error(`Zabbix RPC ${payload.error.code}: ${payload.error.message} ${payload.error.data ?? ""}`);
      }

      if (payload.result === undefined) {
        throw new Error(`Zabbix RPC ${method} returned no result`);
      }

      return payload.result;
    } finally {
      clearTimeout(timeout);
    }
  }
}
