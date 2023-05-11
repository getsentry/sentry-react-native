
export type StackFrameId = number;
export type MicrosecondsSinceBoot = string;

export interface TraceEvent {
  name: string,
  ph: string,
  cat: string,
  pid: number,
  ts: MicrosecondsSinceBoot,
  tid: string,
  args: {
    name?: string,
  },
}

export interface Sample {
  cpu: string;
  name: string;
  ts: MicrosecondsSinceBoot;
  pid: number;
  tid: string;
  weight: string;
  sf: StackFrameId;
}

export interface StackFrame {
  line?: string;
  column?: string;
  funcLine?: string;
  funcColumn?: string;
  name: string;
  category: string;
  parent?: number;
}

export interface Profile {
  traceEvents: TraceEvent[];
  samples: Sample[];
  stackFrames: Record<string, StackFrame>;
}
