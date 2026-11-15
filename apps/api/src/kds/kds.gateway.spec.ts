import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PermissionsResolverService } from "../auth/permissions-resolver.service.js";
import { KdsGateway } from "./kds.gateway.js";

describe("KdsGateway", () => {
  let gateway: KdsGateway;
  let jwt: { verifyAsync: jest.Mock };
  let permissionsResolver: { resolve: jest.Mock };

  function fakeSocket(auth: Record<string, unknown>) {
    return {
      handshake: { auth },
      data: {} as Record<string, unknown>,
      join: jest.fn(),
      disconnect: jest.fn(),
      emit: jest.fn(),
    };
  }

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn() };
    permissionsResolver = { resolve: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        KdsGateway,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue("secret") } },
        { provide: PermissionsResolverService, useValue: permissionsResolver },
      ],
    }).compile();
    gateway = module.get(KdsGateway);
  });

  it("disconnects a socket with no token or organizationId", async () => {
    const socket = fakeSocket({});
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects a socket whose JWT fails verification", async () => {
    jwt.verifyAsync.mockRejectedValue(new Error("invalid token"));
    const socket = fakeSocket({ token: "bad", organizationId: "org_1" });
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects a socket without KDS_VIEW permission in the given organization", async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: "user_1", email: "a@b.com" });
    permissionsResolver.resolve.mockResolvedValue([]);
    const socket = fakeSocket({ token: "good", organizationId: "org_1" });
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("accepts a socket with a valid token and KDS_VIEW permission, signals ready, and joins no room yet", async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: "user_1", email: "a@b.com" });
    permissionsResolver.resolve.mockResolvedValue(["kds:view"]);
    const socket = fakeSocket({ token: "good", organizationId: "org_1" });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.data.organizationId).toBe("org_1");
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith("ready");
  });

  it("joins a station room only after the client explicitly asks, scoped to its own organization", () => {
    const socket = fakeSocket({});
    socket.data.organizationId = "org_1";

    gateway.handleJoinStation(socket as never, "station_1");

    expect(socket.join).toHaveBeenCalledWith("org:org_1:station:station_1");
  });

  it("never joins a room for a socket that was never authenticated", () => {
    const socket = fakeSocket({});
    gateway.handleJoinStation(socket as never, "station_1");
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("broadcast() emits only into the organization+station room", () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: { to: jest.Mock } }).server = { to };

    gateway.broadcast("org_1", "station_1", "ticket.updated", { id: "ticket_1" });

    expect(to).toHaveBeenCalledWith("org:org_1:station:station_1");
    expect(emit).toHaveBeenCalledWith("ticket.updated", { id: "ticket_1" });
  });
});
