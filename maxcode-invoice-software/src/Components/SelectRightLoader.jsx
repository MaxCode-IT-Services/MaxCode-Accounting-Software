import React from "react";

const SelectRightLoader = () => {
  return (
    <div
      className="select-loader-vortex"
      aria-label="Loading options"
      role="status"
    >
      <div className="vortex-ring"></div>
      <div className="vortex-inner"></div>
    </div>
  );
};

export default SelectRightLoader;
