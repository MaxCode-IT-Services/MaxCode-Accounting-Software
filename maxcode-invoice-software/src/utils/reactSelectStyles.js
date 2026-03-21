export const getUnifiedSelectStyles = ({
  hasError = false,
  compact = false,
} = {}) => {
  const minHeight = compact ? "34px" : "48px";

  return {
    control: (base, state) => ({
      ...base,
      minHeight,
      border: hasError
        ? "2px solid #dc3545"
        : state.isFocused
          ? "2px solid #667eea"
          : "2px solid #e9ecef",
      borderColor: state.isHovered && !hasError ? "#d6dbe1" : undefined,
      borderRadius: "10px",
      boxShadow: state.isFocused
        ? "0 0 0 .25rem rgba(102, 126, 234, 0.15)"
        : "none",
      backgroundColor: "#ffffff",
      transition: "all 0.3s ease",
      fontSize: compact ? "0.875rem" : base.fontSize,
    }),
    valueContainer: (base) => ({
      ...base,
      padding: compact ? "2px 8px" : "6px 8px",
    }),
    input: (base) => ({
      ...base,
      margin: compact ? 0 : "2px",
      padding: 0,
    }),
    indicatorsContainer: (base) => ({
      ...base,
      paddingRight: compact ? "4px" : "8px",
    }),
    menu: (base) => ({
      ...base,
      zIndex: 20,
      fontSize: compact ? "0.875rem" : base.fontSize,
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#007026"
        : state.isFocused
          ? "rgba(0, 112, 38, 0.15)"
          : base.backgroundColor,
      color: state.isSelected ? "#fff" : "#212529",
      cursor: "pointer",
    }),
  };
};
