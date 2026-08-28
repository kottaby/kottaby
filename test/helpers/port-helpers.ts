import { spawnSync } from "bun";

export const TEST_SERVER_PORT = 3099;
export const PROTECTED_APP_PORTS = [3000, 4000] as const;

export function getTestServerPortCandidates(): number[] {
  return [TEST_SERVER_PORT];
}

function parseWindowsPids(stdout: string, selfPid: string, parentPid: string): Set<string> {
  const lines = stdout.split(/\r?\n/);
  const pids = new Set<string>();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5 && parts[3] === "LISTENING") {
      const pid = parts[4];
      if (pid && pid !== "0" && pid !== selfPid && pid !== parentPid) {
        pids.add(pid);
      }
    }
  }
  return pids;
}

function killWindowsPortListeners(port: number, selfPid: string, parentPid: string): number {
  const res = spawnSync(["cmd.exe", "/c", `netstat -ano -p tcp | findstr /R /C:":${port} "`], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const stdout = res.stdout.toString().trim();
  if (!stdout) return 0;
  const pids = parseWindowsPids(stdout, selfPid, parentPid);
  for (const pid of pids) {
    spawnSync(["taskkill", "/F", "/T", "/PID", pid], { stdout: "ignore", stderr: "ignore" });
  }
  return pids.size;
}

function killPosixPortListeners(port: number, selfPid: string, parentPid: string): number {
  const res = spawnSync(["lsof", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { stdout: "pipe", stderr: "ignore" });
  const stdout = res.stdout.toString().trim();
  if (!stdout) return 0;
  const pids = stdout.split(/\s+/).filter(pid => Boolean(pid) && pid !== selfPid && pid !== parentPid);
  for (const pid of pids) {
    spawnSync(["kill", "-9", pid], { stdout: "ignore", stderr: "ignore" });
  }
  return pids.length;
}

function isProtectedPort(port: number): boolean {
  return PROTECTED_APP_PORTS.some(p => p === port);
}

export function killListenersOnPort(port: number): number {
  if (isProtectedPort(port)) {
    return 0;
  }
  try {
    const selfPid = String(process.pid);
    const parentPid = String(process.ppid);

    if (process.platform === "win32") {
      return killWindowsPortListeners(port, selfPid, parentPid);
    }
    return killPosixPortListeners(port, selfPid, parentPid);
  } catch {
    return 0;
  }
}
