import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Opens an empty popup window. Call it straight from a click handler: popup
 * blockers only let a window open while the click is still being handled.
 */
const openDetachedWindow = (width: number, height: number): Window => {
  const popup = window.open(
    "",
    "sharkord-soundboard",
    `popup,width=${width},height=${height}`,
  );

  if (!popup) {
    throw new Error(
      "The window was blocked. Allow popups for this site and try again.",
    );
  }

  return popup;
};

/**
 * Ties a popup's life to the calling component: closed when it unmounts or
 * the tab goes, and `onClose` when the user closes it.
 *
 * Call it from a component that already exists when the popup opens, never
 * from one mounted with it: StrictMode mounts a new component twice in
 * development, and the cleanup in between would close the window at once.
 */
const useDetachedWindowLifecycle = (
  popup: Window | undefined,
  onClose: () => void,
) => {
  useEffect(() => {
    if (!popup) return;

    // the popup would outlive the app's tab otherwise, frozen
    const closePopup = () => popup.close();

    // polled rather than heard: no event says reliably, in every browser,
    // that the user closed the window
    const closedCheck = setInterval(() => {
      if (popup.closed) onClose();
    }, 500);

    window.addEventListener("pagehide", closePopup);

    return () => {
      clearInterval(closedCheck);
      window.removeEventListener("pagehide", closePopup);
      closePopup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup]);
};

type TDetachedWindowProps = {
  popup: Window;
  title: string;
  children: ReactNode;
};

/**
 * Renders `children` into a popup from `openDetachedWindow`, which the user
 * can move anywhere, another monitor included. It is the same app underneath:
 * the same store, hooks and state, only drawn somewhere else.
 */
const DetachedWindow = ({ popup, title, children }: TDetachedWindowProps) => {
  const [container, setContainer] = useState<HTMLElement>();

  // nothing to undo, so no cleanup: this may run twice for one window
  // (StrictMode), and rewriting the document makes the second run start clean
  useEffect(() => {
    const { document: popupDocument } = popup;

    // a new popup's blank page can still be swapped for another one, which
    // would wipe what is drawn here. Writing the document cancels that swap.
    popupDocument.open();
    popupDocument.write("<!doctype html><html><head></head><body></body></html>");
    popupDocument.close();

    popupDocument.title = title;

    // the theme lives in <html>'s attributes and the host's stylesheets,
    // @sharkord/ui's classes included, so the popup takes copies of both
    for (const { name, value } of document.documentElement.attributes) {
      popupDocument.documentElement.setAttribute(name, value);
    }

    document
      .querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')
      .forEach((node) => {
        const copy = node.cloneNode(true) as HTMLElement;

        // the popup has no address of its own to resolve a relative one
        if (copy instanceof HTMLLinkElement) {
          copy.href = (node as HTMLLinkElement).href;
        }

        popupDocument.head.appendChild(copy);
      });

    Object.assign(popupDocument.body.style, {
      margin: "0",
      padding: "12px",
      background: "var(--background)",
      color: "var(--foreground)",
    });

    const root = popupDocument.createElement("div");

    popupDocument.body.replaceChildren(root);
    setContainer(root);
    // set up once per window: a new title is not worth redoing it for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup]);

  return container ? createPortal(children, container) : null;
};

export { DetachedWindow, openDetachedWindow, useDetachedWindowLifecycle };
