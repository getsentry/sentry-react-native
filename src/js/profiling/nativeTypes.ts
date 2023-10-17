export interface NativeProfileEvent {
  profile_id: string;
  profile: {
    samples: {
      stack_id: number;
      thread_id: string;
      queue_address?: string;
      elapsed_since_start_ns: string;
    }[];
    stacks: number[][];
    frames: {
      function?: string;
      instruction_addr?: string;
    }[];
    thread_metadata: Record<
      string,
      {
        name?: string;
        priority?: number;
      }
    >;
    queue_metadata?: Record<
      string,
      {
        label: string;
      }
    >;
  };
  transaction: {
    active_thread_id: string;
  };
  measurements: Record<
    string,
    {
      values: {
        elapsed_since_start_ns: number;
        value: number;
      }[];
      unit: string;
    }
  >;
  debug_meta: {
    images: {
      type: 'macho';
      debug_id: string;
      image_addr: string;
      image_size: number;
      code_file: string;
    }[];
  };
}
