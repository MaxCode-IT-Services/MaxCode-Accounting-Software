import { useState, useEffect, useCallback } from "react";

/**
 * Custom hook for column resizing in HTML tables.
 * Provides resize handle functionality similar to Excel/Google Sheets.
 *
 * @param {Array} initialColumnWidths - Array of initial column widths in pixels
 * @returns {Object} - { columnWidths, startResizing, resizingColumnKey, getResizeHandleProps }
 */
const useColumnResize = (initialColumnWidths = []) => {
  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
  const [resizing, setResizing] = useState({
    isResizing: false,
    columnIndex: null,
    startX: 0,
    startWidth: 0,
  });

  // Sync initial widths when they change
  useEffect(() => {
    setColumnWidths(initialColumnWidths);
  }, [initialColumnWidths.length]);

  const startResizing = useCallback(
    (columnIndex, e) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing({
        isResizing: true,
        columnIndex,
        startX: e.clientX,
        startWidth: columnWidths[columnIndex] || 100,
      });
    },
    [columnWidths],
  );

  const handleResize = useCallback(
    (e) => {
      if (!resizing.isResizing) return;
      const deltaX = e.clientX - resizing.startX;
      const newWidth = Math.max(40, resizing.startWidth + deltaX);
      setColumnWidths((prevWidths) => {
        const updated = [...prevWidths];
        updated[resizing.columnIndex] = newWidth;
        return updated;
      });
    },
    [
      resizing.isResizing,
      resizing.startX,
      resizing.startWidth,
      resizing.columnIndex,
    ],
  );

  const stopResizing = useCallback(() => {
    setResizing({
      isResizing: false,
      columnIndex: null,
      startX: 0,
      startWidth: 0,
    });
  }, []);

  useEffect(() => {
    if (resizing.isResizing) {
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", stopResizing);
      return () => {
        document.removeEventListener("mousemove", handleResize);
        document.removeEventListener("mouseup", stopResizing);
      };
    }
  }, [resizing.isResizing, handleResize, stopResizing]);

  /**
   * Returns props for the resize handle div inside a <th>
   * @param {number} columnIndex - The index of the column
   * @returns {Object} - Props to spread on the resize handle div
   */
  const getResizeHandleProps = useCallback(
    (columnIndex) => ({
      className: "column-resize-handle",
      onMouseDown: (e) => startResizing(columnIndex, e),
      style: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: "5px",
        cursor: "col-resize",
        backgroundColor:
          resizing.columnIndex === columnIndex ? "#ff0000" : "transparent",
        zIndex: 3,
        transition: "background-color 0.15s ease",
      },
    }),
    [startResizing, resizing.columnIndex],
  );

  return {
    columnWidths,
    startResizing,
    resizingColumnIndex: resizing.columnIndex,
    getResizeHandleProps,
  };
};

export default useColumnResize;
