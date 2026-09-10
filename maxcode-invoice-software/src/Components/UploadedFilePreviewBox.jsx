import React from "react";

const isImageLike = (value = "", fallbackType = "") => {
  const text = String(value || "").toLowerCase();
  const type = String(fallbackType || "").toLowerCase();
  return (
    type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(\?|#|$)/i.test(text)
  );
};

const getDisplayLabel = (fileUrl = "", fileType = "") => {
  if (isImageLike(fileUrl, fileType)) return "Preview";
  if (/\.pdf(\?|#|$)/i.test(String(fileUrl || ""))) return "PDF";
  if (/\.(xlsx?|csv)(\?|#|$)/i.test(String(fileUrl || ""))) return "Excel";
  return "File";
};

const UploadedFilePreviewBox = ({
  fileUrl,
  fileType = "",
  title = "Open uploaded file in new tab",
  className = "",
  iconClassName = "fa-solid fa-file-alt",
  forceIcon = false,
  hideLabel = false,
}) => {
  if (!fileUrl) return null;

  const imageLike = !forceIcon && isImageLike(fileUrl, fileType);
  const label = getDisplayLabel(fileUrl, fileType);

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`d-inline-flex align-items-center justify-content-center text-decoration-none border rounded-2 bg-white overflow-hidden ${className}`.trim()}
      title={title}
      style={{ width: 50, height: 50, flex: "0 0 50px" }}
    >
      {imageLike ? (
        <img
          src={fileUrl}
          alt={label}
          className="w-100 h-100"
          style={{ objectFit: "cover" }}
          loading="lazy"
        />
      ) : (
        <div className="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-center px-1">
          <i
            className={`${iconClassName} text-primary`}
            style={{ fontSize: 18 }}
          ></i>
          {!hideLabel && (
            <span
              style={{
                fontSize: 9,
                lineHeight: 1,
                marginTop: 2,
                color: "#6c757d",
                fontWeight: 700,
              }}
            >
              {label}
            </span>
          )}
        </div>
      )}
    </a>
  );
};

export default UploadedFilePreviewBox;
