export interface SystemResponse {
  status: 'running';
  uptime: number;
  pid: number;
}

export interface DaemonStatus {
  running: boolean;
  pid?: number;
}
