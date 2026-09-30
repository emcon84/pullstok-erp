import { createHash } from "crypto";
import {
  generatePairingCode,
  normalizePairingCode,
  hashPairingCode,
  generateAgentToken,
  hashAgentToken,
  parseAgentToken,
  verifyAgentToken,
} from "../../src/services/printAgentTokens";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("printAgentTokens", () => {
  it("generatePairingCode returns a readable XXXXX-XXXXX code without ambiguous chars", () => {
    const code = generatePairingCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });

  it("generatePairingCode is random", () => {
    expect(generatePairingCode()).not.toBe(generatePairingCode());
  });

  it("normalizePairingCode ignores case, dashes and spaces", () => {
    expect(normalizePairingCode(" abcde-fgh23 ")).toBe("ABCDEFGH23");
  });

  it("hashPairingCode hashes the normalized code with SHA-256", () => {
    expect(hashPairingCode("abcde-fghjk")).toBe(sha256("ABCDEFGHJK"));
    expect(hashPairingCode("ABCDEFGHJK")).toBe(hashPairingCode("abcde-fghjk"));
  });

  it("generateAgentToken embeds the agent id and a random secret", () => {
    const t1 = generateAgentToken("agent-1");
    const t2 = generateAgentToken("agent-1");
    expect(t1.startsWith("agent-1.")).toBe(true);
    expect(t1).not.toBe(t2);
    expect(t1.split(".")[1].length).toBeGreaterThanOrEqual(64);
  });

  it("parseAgentToken extracts the agent id (or null when malformed)", () => {
    expect(parseAgentToken("agent-1.secret")).toEqual({ agentId: "agent-1" });
    expect(parseAgentToken("sinpunto")).toBeNull();
    expect(parseAgentToken(".secret")).toBeNull();
    expect(parseAgentToken("agent-1.")).toBeNull();
  });

  it("verifyAgentToken accepts the right token and rejects others", () => {
    const token = generateAgentToken("agent-1");
    const stored = hashAgentToken(token);
    expect(stored).toBe(sha256(token));
    expect(verifyAgentToken(token, stored)).toBe(true);
    expect(verifyAgentToken(generateAgentToken("agent-1"), stored)).toBe(false);
    expect(verifyAgentToken(token, null)).toBe(false);
    expect(verifyAgentToken(token, "corto")).toBe(false);
  });
});
