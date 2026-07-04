import type { MboxApi } from "../../shared/mboxApi";

declare global {
  interface Window {
    mbox: MboxApi;
  }
}

export {};
