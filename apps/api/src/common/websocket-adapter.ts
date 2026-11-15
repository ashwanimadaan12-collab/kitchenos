import type { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";
import type { Env } from "../config/env.schema.js";

/** Same CORS_ORIGIN the REST API's app.enableCors() already uses — a `@WebSocketGateway`
 *  decorator can't read ConfigService itself (it's evaluated before DI runs), so this is where
 *  the socket server's allowed origin actually gets set. */
export class ConfiguredSocketIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const config = this.app.get(ConfigService<Env, true>);
    return super.createIOServer(port, {
      ...options,
      cors: { origin: config.get("CORS_ORIGIN", { infer: true }), credentials: true },
    });
  }
}
