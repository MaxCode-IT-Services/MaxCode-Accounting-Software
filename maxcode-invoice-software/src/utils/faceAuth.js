const FACE_API_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
const FACE_MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

let faceApiLoaderPromise = null;
let faceModelLoaderPromise = null;

const getFaceApi = () => {
  if (typeof window === "undefined" || !window.faceapi) {
    throw new Error("Face API is not available in this environment");
  }

  return window.faceapi;
};

const loadScript = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Browser environment unavailable"));
  }

  if (window.faceapi) {
    return Promise.resolve(window.faceapi);
  }

  if (faceApiLoaderPromise) {
    return faceApiLoaderPromise;
  }

  faceApiLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[data-face-api-script="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => resolve(window.faceapi),
        {
          once: true,
        },
      );
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Unable to load face recognition library")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = FACE_API_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.faceApiScript = "true";
    script.onload = () => resolve(window.faceapi);
    script.onerror = () =>
      reject(new Error("Unable to load face recognition library"));
    document.head.appendChild(script);
  });

  return faceApiLoaderPromise;
};

export const ensureFaceModelsLoaded = async () => {
  await loadScript();

  if (faceModelLoaderPromise) {
    return;
  }

  const faceapi = getFaceApi();

  faceModelLoaderPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(FACE_MODEL_URL),
  ]).then(() => undefined);

  return faceModelLoaderPromise;
};

export const isFaceAuthSupported = () => {
  if (typeof navigator === "undefined") return false;
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function",
  );
};

export const createFaceDetectorOptions = ({
  inputSize = 160,
  scoreThreshold = 0.5,
} = {}) => {
  const faceapi = getFaceApi();
  return new faceapi.TinyFaceDetectorOptions({
    inputSize,
    scoreThreshold,
  });
};

export const extractFaceDescriptorFromVideo = async (
  videoElement,
  options = {},
) => {
  if (!videoElement) {
    throw new Error("Camera feed is not available");
  }

  await ensureFaceModelsLoaded();
  const faceapi = getFaceApi();
  const detectorOptions = createFaceDetectorOptions(options);
  const includeLandmarks = options.includeLandmarks !== false;
  const includeExpressions = options.includeExpressions !== false;

  let detection = faceapi.detectSingleFace(videoElement, detectorOptions);

  if (includeLandmarks) {
    detection = detection.withFaceLandmarks();
  }

  detection = await detection.withFaceDescriptor();

  let expressions = {};
  let landmarks = detection?.landmarks || null;

  if (includeExpressions) {
    const expressionDetection = await faceapi
      .detectSingleFace(videoElement, detectorOptions)
      .withFaceLandmarks()
      .withFaceExpressions();

    expressions = expressionDetection?.expressions || {};
    landmarks = expressionDetection?.landmarks || landmarks;
  }

  if (!detection?.descriptor) {
    throw new Error("Face not detected. Please align your face in frame.");
  }

  return {
    descriptor: Array.from(detection.descriptor || []),
    expressions,
    landmarks,
    detectionScore: detection?.detection?.score || 0,
  };
};

export const estimateFacePose = (landmarks) => {
  if (!landmarks) {
    return { yaw: 0, pitch: 0 };
  }

  const leftEye = landmarks.getLeftEye?.() || [];
  const rightEye = landmarks.getRightEye?.() || [];
  const nose = landmarks.getNose?.() || [];

  if (
    leftEye.length === 0 ||
    rightEye.length === 0 ||
    nose.length === 0
  ) {
    return { yaw: 0, pitch: 0 };
  }

  const leftEyeCenter = leftEye.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  leftEyeCenter.x /= leftEye.length;
  leftEyeCenter.y /= leftEye.length;

  const rightEyeCenter = rightEye.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  rightEyeCenter.x /= rightEye.length;
  rightEyeCenter.y /= rightEye.length;

  const noseTip = nose[3] || nose[Math.floor(nose.length / 2)] || nose[0];

  const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
  const eyeMidY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
  const eyeDistance = Math.max(
    1,
    Math.hypot(
      rightEyeCenter.x - leftEyeCenter.x,
      rightEyeCenter.y - leftEyeCenter.y,
    ),
  );

  const yaw = (noseTip.x - eyeMidX) / (eyeDistance / 2);
  const pitch = (noseTip.y - eyeMidY) / eyeDistance;

  return { yaw, pitch };
};
