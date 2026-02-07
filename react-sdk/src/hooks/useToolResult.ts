"use client";

import { useState, useCallback } from 'react';
import { useHsafaClient } from '../context.js';

export interface UseToolResultReturn {
  submit: (
    smartSpaceId: string,
    params: { runId: string; toolCallId: string; result: unknown }
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

  const submit = useCallback(
    async (
      smartSpaceId: string,
      params: { runId: string; toolCallId: string; result: unknown }
    ) => {
      setIsSubmitting(true);
      try {
        await client.tools.submitResult(smartSpaceId, params);
      } finally {
        setIsSubmitting(false);
      }
    },
    [client]
  );

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

  return { submit, submitToRun, isSubmitting };
}
