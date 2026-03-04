"use client";

import { useState, useCallback } from 'react';
import { useHsafaClient } from '../context.js';

export interface UseToolResultReturn {
  submit: (
    runId: string,
    params: { callId: string; result: unknown }
  ) => Promise<void>;
  submitToRun: (
    runId: string,
    params: { callId: string; result: unknown }
  ) => Promise<void>;
  isSubmitting: boolean;
}

export function useToolResult(): UseToolResultReturn {
  const client = useHsafaClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitToRun = useCallback(
    async (
      runId: string,
      params: { callId: string; result: unknown }
    ) => {
      setIsSubmitting(true);
      try {
        await client.tools.submitRunResult(runId, params);
      } finally {
        setIsSubmitting(false);
      }
    },
    [client]
  );

  return { submit: submitToRun, submitToRun, isSubmitting };
}
