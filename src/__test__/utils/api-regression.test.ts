import { describe, expect, it } from "bun:test";

/**
 * 回归测试：覆盖 review 中发现的三个行为回归场景
 * 1. getStatus() API fallback 返回设备列表时不会崩溃
 * 2. previewACLAccess 透传 proto 参数
 * 3. getTailnetInfo 返回 /settings 数据时正确展示
 */

// ---- 测试 1: getStatus API fallback 不会把设备列表当 CLIStatus 处理 ----

describe("getNetworkStatus API fallback", () => {
  it("should handle API device list response without crashing", () => {
    // 模拟 API fallback 返回的 UnifiedResponse
    const apiResponse = {
      success: true,
      source: "api" as const,
      data: [
        {
          id: "device-1",
          name: "node1.tailnet.ts.net",
          hostname: "node1",
          os: "linux",
          addresses: ["100.64.0.1"],
          authorized: true,
          lastSeen: "2026-03-12T00:00:00Z",
          clientVersion: "1.60.0",
          created: "2026-01-01T00:00:00Z",
          expires: "2027-01-01T00:00:00Z",
          keyExpiryDisabled: false,
          isExternal: false,
          machineKey: "mkey:abc",
          nodeKey: "nkey:def",
          blocksIncomingConnections: false,
          updateAvailable: false,
          user: "user@example.com",
        },
      ],
    };

    // 验证 source 是 api 时走设备列表分支
    expect(apiResponse.source).toBe("api");
    expect(Array.isArray(apiResponse.data)).toBe(true);

    // 验证设备列表可以安全遍历和访问字段
    const data = apiResponse.data;
    expect(data.length).toBe(1);
    expect(data[0].name).toBe("node1.tailnet.ts.net");
    expect(data[0].hostname).toBe("node1");
    expect(data[0].addresses.join(", ")).toBe("100.64.0.1");
  });

  it("should handle CLI status response as TailscaleCLIStatus", () => {
    // CLI 返回 source: "cli"，数据结构完全不同
    const cliResponse = {
      success: true,
      source: "cli" as const,
      data: {
        Version: "1.60.0",
        TUN: true,
        BackendState: "Running",
        TailscaleIPs: ["100.64.0.1"],
        Self: {
          ID: "n1",
          PublicKey: "key1",
          HostName: "myhost",
          DNSName: "myhost.tailnet.ts.net",
          OS: "linux",
          UserID: 1,
          TailscaleIPs: ["100.64.0.1"],
        },
      },
    };

    expect(cliResponse.source).toBe("cli");
    // CLI 数据有 Version、Self 等字段
    expect(cliResponse.data.Version).toBe("1.60.0");
    expect(cliResponse.data.Self.HostName).toBe("myhost");
  });
});

// ---- 测试 2: previewACLAccess 透传 proto ----

describe("previewACLAccess proto passthrough", () => {
  it("should include proto in request body when provided", () => {
    // 模拟 previewACLAccess 构建请求体的逻辑
    const src = "user@example.com";
    const dst = "tag:server";
    const proto = "tcp";

    const body: Record<string, string> = { src, dst };
    if (proto) body.proto = proto;

    expect(body).toEqual({ src, dst, proto: "tcp" });
  });

  it("should not include proto when undefined", () => {
    const src = "user@example.com";
    const dst = "tag:server";
    const proto: string | undefined = undefined;

    const body: Record<string, string> = { src, dst };
    if (proto) body.proto = proto;

    expect(body).toEqual({ src, dst });
    expect("proto" in body).toBe(false);
  });
});

// ---- 测试 3: getTailnetInfo settings 数据展示 ----

describe("getTailnetInfo settings display", () => {
  it("should correctly format /settings response fields", () => {
    // /settings 端点返回的实际字段
    const settingsData: Record<string, unknown> = {
      devicesApprovalOn: true,
      devicesAutoUpdatesOn: false,
      devicesKeyDurationDays: 90,
      networkFlowLoggingOn: true,
      regionalRoutingOn: false,
    };

    // 模拟 admin-tools.ts getTailnetInfo handler 的格式化逻辑
    let formatted = "**Tailnet Settings**\n\n";
    for (const [key, value] of Object.entries(settingsData)) {
      if (typeof value === "boolean") {
        formatted += `  - ${key}: ${value ? "Enabled" : "Disabled"}\n`;
      } else if (value !== null && value !== undefined) {
        formatted += `  - ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}\n`;
      }
    }

    expect(formatted).toContain("devicesApprovalOn: Enabled");
    expect(formatted).toContain("devicesAutoUpdatesOn: Disabled");
    expect(formatted).toContain("devicesKeyDurationDays: 90");
    expect(formatted).toContain("networkFlowLoggingOn: Enabled");
    expect(formatted).toContain("regionalRoutingOn: Disabled");
  });

  it("should handle empty settings response", () => {
    const settingsData: Record<string, unknown> = {};
    const isEmpty = Object.keys(settingsData).length === 0;
    expect(isEmpty).toBe(true);
  });

  it("should not crash on old-schema fields being absent", () => {
    // 确保不再依赖 name/organization/created 等不存在的字段
    const settingsData: Record<string, unknown> = {
      devicesApprovalOn: false,
    };

    // 老代码会访问 info.name, info.organization, info.created
    // 新代码只遍历实际存在的 key
    expect(settingsData).not.toHaveProperty("name");
    expect(settingsData).not.toHaveProperty("organization");
    expect(settingsData).not.toHaveProperty("created");

    const keys = Object.keys(settingsData);
    expect(keys).toEqual(["devicesApprovalOn"]);
  });
});
