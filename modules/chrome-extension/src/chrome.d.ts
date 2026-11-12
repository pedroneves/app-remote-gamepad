/**
 * The few `chrome.*` extension APIs this extension uses, typed by hand
 * because the project takes no third-party dependencies (such as `@types/chrome`).
 *
 * Reference: https://developer.chrome.com/docs/extensions/reference/api
 */

declare namespace chrome {
  namespace events {
    interface Event<T extends (...args: never[]) => void> {
      addListener(callback: T): void;
      removeListener(callback: T): void;
    }
  }

  namespace runtime {
    /** Set while the extension is loaded. Unset in a content script orphaned by an extension reload. */
    const id: string | undefined;

    interface MessageSender {
      id?: string;
      url?: string;
      tab?: { id?: number; url?: string };
    }

    interface Port {
      readonly name: string;
      readonly sender?: MessageSender;
      postMessage(message: unknown): void;
      disconnect(): void;
      readonly onMessage: events.Event<(message: unknown, port: Port) => void>;
      readonly onDisconnect: events.Event<(port: Port) => void>;
    }

    function connect(connectInfo?: { name?: string }): Port;
    function getURL(path: string): string;

    const onConnect: events.Event<(port: Port) => void>;
  }

  namespace storage {
    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }

    interface StorageArea {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    }

    const local: StorageArea;

    const onChanged: events.Event<
      (changes: Record<string, StorageChange>, areaName: string) => void
    >;
  }
}
