import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { PERMISSIONS } from "@kitchenos/shared";
import { PermissionsResolverService } from "../auth/permissions-resolver.service.js";
import type { Env } from "../config/env.schema.js";
import type { AccessTokenPayload } from "../auth/jwt-access.strategy.js";

export type KdsTicketEvent = "ticket.created" | "ticket.updated" | "ticket.cancelled";

/**
 * Pushes kitchen-ticket changes to every KDS board watching a station, instead of each board
 * polling or waiting for a manual refresh — the same ticket data `KdsController`'s REST endpoints
 * already serve, just delivered the moment it changes. Kept deliberately thin: this gateway only
 * authenticates the socket and fans events out to the right room; `KdsService` still owns every
 * ticket mutation and calls `broadcast` itself afterwards (see kds.service.ts), the same direct-
 * call style this codebase already uses for its other side effects (KDS ticket creation,
 * inventory consumption) rather than introducing an event-bus layer just for this.
 *
 * A socket authenticates once at connection time with the same JWT + active-organization-id the
 * REST API already uses (the web app's /api/ws-token route hands the browser that pair) —
 * verified here exactly like JwtAccessStrategy does for HTTP, and gated on the same KDS_VIEW
 * permission KdsController requires. Tickets are only ever broadcast into
 * `org:{organizationId}:station:{stationId}` rooms, so one tenant's kitchen traffic can never
 * reach another's socket, and a socket only sees stations it explicitly joins.
 */
@WebSocketGateway({ namespace: "/kds" })
export class KdsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(KdsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly permissionsResolver: PermissionsResolverService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const { token, organizationId } = socket.handshake.auth as { token?: string; organizationId?: string };
      if (!token || !organizationId) throw new Error("Missing token or organizationId");

      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      });
      const permissions = await this.permissionsResolver.resolve(payload.sub, organizationId);
      if (!permissions.includes(PERMISSIONS.KDS_VIEW)) throw new Error("Not permitted to view KDS for this organization");

      socket.data.organizationId = organizationId;
      // The client's own "connect" event fires as soon as the transport is up — before this
      // async handler (JWT verify + permission lookup, both real I/O) has run. A client that
      // emits "station:join" straight from "connect" can lose the race and join nothing, with no
      // error on either side. This explicit "ready" is the handshake that fixes it: the client
      // waits for it before joining a room.
      socket.emit("ready");
    } catch (err) {
      this.logger.warn(`Rejected KDS socket connection: ${err instanceof Error ? err.message : "unknown error"}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Nothing to clean up — rooms are torn down automatically when a socket disconnects.
  }

  /** The client joins one station's room once it knows which board it's displaying (and only
   *  after the "ready" handshake above — see handleConnection). */
  @SubscribeMessage("station:join")
  handleJoinStation(@ConnectedSocket() socket: Socket, @MessageBody() stationId: string): void {
    const organizationId = socket.data.organizationId as string | undefined;
    if (!organizationId || !stationId) return;
    socket.join(this.roomName(organizationId, stationId));
  }

  broadcast(organizationId: string, stationId: string, event: KdsTicketEvent, ticket: unknown): void {
    this.server.to(this.roomName(organizationId, stationId)).emit(event, ticket);
  }

  private roomName(organizationId: string, stationId: string): string {
    return `org:${organizationId}:station:${stationId}`;
  }
}
