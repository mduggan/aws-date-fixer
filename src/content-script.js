(() => {
  let currentSourceFormat = null;
  let currentUrl = "";
  let observer = null;
  let timeout = null;
  const nodesToProcess = new Set();

  // Updated Regex: Specifically targets the date part and allows for trailing spaces/times
  // Numerical: 12/25/2025 (US) or 25/12/2025 (AU)
  const NUMERIC_REGEX = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?=\s|$|\b)/g;

  // Textual: Dec 19, 2025 or December 19, 2025
  const TEXT_REGEX =
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;

  const MONTH_MAP = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    /*may: '05',*/ june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };

  function getBrowserDateFormat() {
    const parts = new Intl.DateTimeFormat().formatToParts(
      new Date(2025, 11, 25),
    );
    const format =
      parts.findIndex((p) => p.type === "day") >
      parts.findIndex((p) => p.type === "month")
        ? "US"
        : "AU";
    console.debug(`[DateFixer] Browser locale detected as: ${format}`);
    return format;
  }

  function checkUrlChange() {
    if (window.location.href === currentUrl) return;

    currentUrl = window.location.href;
    console.info(`[DateFixer] URL change detected: ${currentUrl}`);

    const check = (list) =>
      list.some((p) =>
        p instanceof RegExp ? p.test(currentUrl) : currentUrl.includes(p),
      );

    let newFormat = null;
    if (typeof US_URLS !== "undefined" && check(US_URLS)) newFormat = "US";
    else if (typeof AU_URLS !== "undefined" && check(AU_URLS)) newFormat = "AU";
    else if (typeof AUTO_URLS !== "undefined" && check(AUTO_URLS))
      newFormat = getBrowserDateFormat();

    if (newFormat !== currentSourceFormat) {
      console.log(
        `[DateFixer] Format context switched: ${currentSourceFormat} -> ${newFormat}`,
      );
      currentSourceFormat = newFormat;

      if (currentSourceFormat) {
        console.log(
          `[DateFixer] Initializing processing for ${currentSourceFormat} format...`,
        );
        processNode(document.body);
        startObserver();
      } else {
        if (observer) {
          console.log(
            "[DateFixer] No match for this URL. Disconnecting observer.",
          );
          observer.disconnect();
        }
      }
    } else if (currentSourceFormat) {
      console.debug(
        "[DateFixer] URL changed but format remains same. Re-scanning new page content.",
      );
      processNode(document.body);
    }
  }

  /**
   * Performs the regex replacement on a string
   */
  function formatText(text) {
    let matchFound = false;

    // A. Handle Numerical Dates (MM/DD/YYYY or DD/MM/YYYY)
    let processed = text.replace(NUMERIC_REGEX, (_match, p1, p2, p3) => {
      matchFound = true;
      const year = p3;
      const month =
        currentSourceFormat === "US"
          ? p1.padStart(2, "0")
          : p2.padStart(2, "0");
      const day =
        currentSourceFormat === "US"
          ? p2.padStart(2, "0")
          : p1.padStart(2, "0");
      return `${year}-${month}-${day}`;
    });

    // B. Handle Text Dates (Dec 19, 2025)
    processed = processed.replace(
      TEXT_REGEX,
      (_match, monthName, day, year) => {
        matchFound = true;
        const monthNum = MONTH_MAP[monthName.toLowerCase().substring(0, 3)];
        return `${year}-${monthNum}-${day.padStart(2, "0")}`;
      },
    );

    if (matchFound)
      console.debug(
        `[DateFixer] Transformed: "${text.trim()}" -> "${processed.trim()}"`,
      );
    return processed;
  }

  function processNode(node) {
    if (!currentSourceFormat || !node) return;

    if (node.nodeType === 3) {
      const parent = node.parentElement;
      if (parent && !["SCRIPT", "STYLE", "CODE"].includes(parent.tagName)) {
        const original = node.nodeValue;
        const replaced = formatText(original);
        if (original !== replaced) node.nodeValue = replaced;
      }
    } else if (node.nodeType === 1) {
      const targets = node.nodeName === "DIV" ? [node] : [];
      targets.push(...node.querySelectorAll("div"));

      for (const div of targets) {
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, {
          // avoid changing some tags
          acceptNode: (n) =>
            ["SCRIPT", "STYLE", "CODE", "SMALL", "TEXTAREA"].includes(
              n.parentElement?.tagName,
            )
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        });
        let textNode;
        while ((textNode = walker.nextNode())) {
          const original = textNode.nodeValue;
          const replaced = formatText(original);
          if (original !== replaced) textNode.nodeValue = replaced;
        }
      }
    }
  }

  function debouncedProcess() {
    if (!currentSourceFormat) return;

    if (observer) observer.disconnect();
    const nodeCount = nodesToProcess.size;

    nodesToProcess.forEach((node) => processNode(node));
    nodesToProcess.clear();

    console.debug(
      `[DateFixer] Debounced batch complete. Processed ${nodeCount} changed nodes.`,
    );
    observe();
  }

  function startObserver() {
    console.log("[DateFixer] (re)Starting MutationObserver...");
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => nodesToProcess.add(node));
        } else if (mutation.type === "characterData") {
          nodesToProcess.add(mutation.target);
        }
      }
      clearTimeout(timeout);
      timeout = setTimeout(debouncedProcess, 100);
    });
    observe();
  }

  function observe() {
    if (!observer || !document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function init() {
    console.log(
      "[DateFixer] Content script injected. Waiting for URL match...",
    );

    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", checkUrlChange);
    } else {
      checkUrlChange();
    }

    // SPA polling
    setInterval(checkUrlChange, 1000);
    window.addEventListener("popstate", checkUrlChange);
  }

  init();
})();
