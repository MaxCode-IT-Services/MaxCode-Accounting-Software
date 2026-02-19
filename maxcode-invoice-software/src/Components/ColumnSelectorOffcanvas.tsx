import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const ColumnSelectorOffcanvas = ({
  show,
  onHide,
  columns,
  visibleColumns,
  setVisibleColumns,
  setColumns,
  fixedColumns = [],
  pinnedColumns,
  setPinnedColumns,
}) => {
  const [isAllAutoResized, setIsAllAutoResized] = React.useState(false);
  const [isAllCleared, setIsAllCleared] = React.useState(false);
  const [originalWidths, setOriginalWidths] = React.useState({});

  // Toggle column visibility
  const handleColumnToggle = (key) => {
    if (fixedColumns.includes(key)) return;
    setVisibleColumns({ ...visibleColumns, [key]: !visibleColumns[key] });
    setIsAllCleared(false);
  };

  // Select all non-fixed columns
  const handleSelectAll = (e) => {
    const shouldSelectAll = e.target.checked;
    const updated = { ...visibleColumns };
    columns.forEach((col) => {
      if (!fixedColumns.includes(col.key)) {
        updated[col.key] = shouldSelectAll;
      }
    });
    setVisibleColumns(updated);
    setIsAllCleared(!shouldSelectAll);
  };

  // Clear all non-fixed columns
  const handleClearAll = () => {
    const shouldClear = !isAllCleared;
    const updated = { ...visibleColumns };
    columns.forEach((col) => {
      if (!fixedColumns.includes(col.key)) {
        updated[col.key] = !shouldClear;
      }
    });
    setVisibleColumns(updated);
    setIsAllCleared(shouldClear);
  };

  // Auto-resize all columns
  const handleAutoResizeAll = () => {
    if (!isAllAutoResized) {
      // Store original widths
      const widths = {};
      columns.forEach((col) => {
        widths[col.key] = col.width;
      });
      setOriginalWidths(widths);

      // Set all to auto width
      const updatedColumns = columns.map((col) => ({
        ...col,
        width: "auto",
      }));
      setColumns(updatedColumns);
    } else {
      // Restore original widths
      const updatedColumns = columns.map((col) => ({
        ...col,
        width: originalWidths[col.key] || undefined,
      }));
      setColumns(updatedColumns);
    }
    setIsAllAutoResized(!isAllAutoResized);
  };

  // Auto-resize single column
  const handleAutoResizeColumn = (columnKey) => {
    setColumns((prevColumns) => {
      const column = prevColumns.find((col) => col.key === columnKey);
      const isCurrentlyAutoResized = column?.width === "auto";

      if (!isCurrentlyAutoResized) {
        // Store original width before resizing
        setOriginalWidths((prev) => ({
          ...prev,
          [columnKey]: column.width,
        }));

        return prevColumns.map((col) =>
          col.key === columnKey ? { ...col, width: "auto" } : col,
        );
      } else {
        // Restore original width
        return prevColumns.map((col) =>
          col.key === columnKey
            ? { ...col, width: originalWidths[columnKey] || undefined }
            : col,
        );
      }
    });
  };

  // Handle column reordering
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const reordered = [...columns];
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    // Maintain pinned columns order
    const isPinnedLeft = pinnedColumns.left.includes(removed.key);
    const isPinnedRight = pinnedColumns.right.includes(removed.key);

    if (isPinnedLeft || isPinnedRight) {
      const newPinnedLeft = reordered
        .filter((col) => pinnedColumns.left.includes(col.key))
        .map((col) => col.key);
      const newPinnedRight = reordered
        .filter((col) => pinnedColumns.right.includes(col.key))
        .map((col) => col.key);

      setPinnedColumns({
        left: newPinnedLeft,
        right: newPinnedRight,
      });
    }

    setColumns(reordered);
  };

  // Toggle column pin position
  const togglePinColumn = (columnKey, position) => {
    setPinnedColumns((prev) => {
      const newPinned = { ...prev };

      // Remove from both positions first
      newPinned.left = newPinned.left.filter((key) => key !== columnKey);
      newPinned.right = newPinned.right.filter((key) => key !== columnKey);

      // Toggle the specified position
      const isCurrentlyPinned = prev[position].includes(columnKey);
      if (!isCurrentlyPinned) {
        newPinned[position] = [...newPinned[position], columnKey];
      }

      return newPinned;
    });
  };

  // Check if column is pinned
  const isPinned = (columnKey) => {
    if (pinnedColumns.left.includes(columnKey)) return "left";
    if (pinnedColumns.right.includes(columnKey)) return "right";
    return false;
  };

  // Check if column is auto-resized
  const isAutoResized = (columnKey) => {
    const column = columns.find((col) => col.key === columnKey);
    return column?.width === "auto";
  };

  // Check if all non-fixed columns are selected
  const allNonFixedSelected = columns
    .filter((col) => !fixedColumns.includes(col.key))
    .every((col) => visibleColumns[col.key]);

  return (
    <>
      <style>
        {`
          .drop-placeholder-wrapper > div {
            border: 2px dashed #0d6efd;
            border-radius: 5px;
            height: 48px;
            background-color: #e9ecef;
            margin-bottom: 8px;
          }
          .pinned-left {
            background-color: rgba(13, 110, 253, 0.1) !important;
            border-left: 3px solid #0d6efd !important;
          }
          .pinned-right {
            background-color: rgba(13, 110, 253, 0.1) !important;
            border-right: 3px solid #0d6efd !important;
          }
          .column-item {
            transition: all 0.2s ease;
          }
          .column-item:hover {
            background-color: #f8f9fa;
          }
        `}
      </style>

      {show && (
        <div
          className="offcanvas-backdrop fade show"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.69)",
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1040,
          }}
          onClick={onHide}
        ></div>
      )}

      <div
        className={`offcanvas offcanvas-start ${show ? "show" : ""}`}
        tabIndex="-1"
        style={{
          visibility: show ? "visible" : "hidden",
          zIndex: 1045,
          width: "400px",
          maxWidth: "100%",
        }}
        data-bs-backdrop="static"
      >
        <div className="offcanvas-header">
          <h5 className="offcanvas-title">Column Management</h5>
          <button type="button" className="btn-close" onClick={onHide}></button>
        </div>

        <div
          className="position-sticky top-0 bg-white p-3 border-bottom mb-2"
          style={{ zIndex: 1 }}
        >
          <div className="d-flex justify-content-between align-items-center">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={allNonFixedSelected}
                onChange={handleSelectAll}
                id="selectAllCheckbox"
                disabled={
                  columns.filter((col) => !fixedColumns.includes(col.key))
                    .length === 0
                }
              />
              <label
                className="form-check-label fw-bold"
                htmlFor="selectAllCheckbox"
              >
                Select All
              </label>
            </div>
            <div className="d-flex gap-2">
              <button
                className={`btn btn-sm ${isAllAutoResized ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={handleAutoResizeAll}
                title={
                  isAllAutoResized
                    ? "Reset all column widths"
                    : "Auto-resize all columns"
                }
                data-bs-toggle="tooltip"
              >
                <i
                  className={`fas ${isAllAutoResized ? "fa-compress" : "fa-expand"}`}
                ></i>
              </button>
              <button
                className={`btn btn-sm ${isAllCleared ? "btn-danger" : "btn-outline-danger"}`}
                onClick={handleClearAll}
                disabled={
                  columns.filter((col) => !fixedColumns.includes(col.key))
                    .length === 0
                }
                title={
                  isAllCleared ? "Show all columns" : "Clear all selections"
                }
                data-bs-toggle="tooltip"
              >
                <i
                  className={`fas ${isAllCleared ? "fa-eye" : "fa-eye-slash"}`}
                ></i>
              </button>
            </div>
          </div>
        </div>

        <div className="offcanvas-body pt-0">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="column-list">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {columns.map((column, index) => {
                    const pinnedPosition = isPinned(column.key);
                    const isAutoResizedColumn = isAutoResized(column.key);

                    return (
                      <Draggable
                        key={column.key}
                        draggableId={column.key}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`column-item ${pinnedPosition ? `pinned-${pinnedPosition}` : ""}`}
                            style={{
                              ...provided.draggableProps.style,
                              background: snapshot.isDragging
                                ? "#f8f9fa"
                                : "transparent",
                              padding: "8px",
                              borderRadius: "5px",
                              userSelect: "none",
                              display: "flex",
                              alignItems: "center",
                              border: "1px solid #dee2e6",
                              gap: "8px",
                            }}
                          >
                            <span
                              {...provided.dragHandleProps}
                              style={{
                                cursor: "grab",
                                fontSize: "14px",
                                paddingRight: "5px",
                              }}
                            >
                              <i className="fa-solid fa-grip text-muted"></i>
                            </span>
                            <div className="form-check m-0 flex-grow-1">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={visibleColumns[column.key]}
                                onChange={() => handleColumnToggle(column.key)}
                                id={`flexCheck${column.key}`}
                                disabled={fixedColumns.includes(column.key)}
                              />
                              <label
                                className="form-check-label"
                                htmlFor={`flexCheck${column.key}`}
                              >
                                {column.label}
                                {fixedColumns.includes(column.key) && (
                                  <span className="text-muted ms-1">
                                    (Required)
                                  </span>
                                )}
                              </label>
                            </div>
                            <div className="d-flex gap-1">
                              <button
                                className={`btn btn-sm ${
                                  pinnedPosition === "left"
                                    ? "btn-primary"
                                    : "btn-outline-secondary"
                                }`}
                                onClick={() =>
                                  togglePinColumn(column.key, "left")
                                }
                                title={
                                  pinnedPosition === "left"
                                    ? "Unpin from left"
                                    : "Pin to left"
                                }
                                data-bs-toggle="tooltip"
                              >
                                <i
                                  className={`fa-solid ${
                                    pinnedPosition === "left"
                                      ? "fa-thumbtack-slash"
                                      : "fa-thumbtack fa-rotate-90"
                                  }`}
                                ></i>
                              </button>
                              <button
                                className={`btn btn-sm ${
                                  pinnedPosition === "right"
                                    ? "btn-primary"
                                    : "btn-outline-secondary"
                                }`}
                                onClick={() =>
                                  togglePinColumn(column.key, "right")
                                }
                                title={
                                  pinnedPosition === "right"
                                    ? "Unpin from right"
                                    : "Pin to right"
                                }
                                data-bs-toggle="tooltip"
                              >
                                <i
                                  className={`fa-solid ${
                                    pinnedPosition === "right"
                                      ? "fa-thumbtack-slash"
                                      : "fa-thumbtack fa-rotate-270"
                                  }`}
                                ></i>
                              </button>
                              <button
                                className={`btn btn-sm ${
                                  isAutoResizedColumn
                                    ? "btn-primary"
                                    : "btn-outline-secondary"
                                }`}
                                onClick={() =>
                                  handleAutoResizeColumn(column.key)
                                }
                                title={
                                  isAutoResizedColumn
                                    ? "Reset column width"
                                    : "Auto-resize this column"
                                }
                                data-bs-toggle="tooltip"
                              >
                                <i
                                  className={`fas ${isAutoResizedColumn ? "fa-compress" : "fa-expand"}`}
                                ></i>
                              </button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  <div className="drop-placeholder-wrapper">
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>
    </>
  );
};

export default ColumnSelectorOffcanvas;
