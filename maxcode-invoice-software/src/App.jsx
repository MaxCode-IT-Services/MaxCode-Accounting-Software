// App.js
import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Player } from "@lottiefiles/react-lottie-player";
import AdminDashboardLayout from "../src/Components/DashboardLayout";
import Home from "../src/Home";
import PrivacyPolicy from "./PrivacyPolicy";
import Login from "../src/Pages/Login";
import {
  hasModuleAccess,
  getStoredUserInfo,
  getFirstAllowedRoute,
  getRoleRoutePrefix,
} from "../src/utils/permissions";
import { verifyServerSession } from "../src/utils/api";

// Lazy load User Dashboard pages
const AdminDashboard = lazy(() => import("../src/Pages/Dashboard.jsx"));
const ClientManagement = lazy(() => import("../src/Pages/ClientManagement"));
const LeadManagement = lazy(() => import("../src/Pages/LeadManagement"));
const FileManagement = lazy(() => import("../src/Pages/FileManagement"));
const QutationManagement = lazy(
  () => import("../src/Pages/QutationManagement"),
);
const VendorManagement = lazy(() => import("../src/Pages/VendorManagement"));
const StaffManagement = lazy(() => import("../src/Pages/StaffManagement"));
const PurchaseManagement = lazy(
  () => import("../src/Pages/PurchaseManagement"),
);
const CompanyExpenseManagement = lazy(
  () => import("../src/Pages/CompanyExpenseManagement"),
);
const SalesManagement = lazy(() => import("../src/Pages/SalesManagement"));
const ServicesManagement = lazy(
  () => import("../src/Pages/ServicesManagement"),
);
const ProjectManagement = lazy(() => import("../src/Pages/ProjectManagement"));
const ProjectDetails = lazy(() => import("../src/Pages/ProjectDetails"));
const ProjectCredentials = lazy(
  () => import("../src/Pages/ProjectCredentials"),
);
const MaxcodeCredential = lazy(() => import("../src/Pages/MaxcodeCredential"));
const OtpRequestManagement = lazy(
  () => import("../src/Pages/OtpRequestManagement"),
);
const RcmManagement = lazy(() => import("../src/Pages/RcmManagement"));
const CreditDebitNotesManagement = lazy(
  () => import("../src/Pages/CreditDebitNotesManagement"),
);
const LedgerManagement = lazy(() => import("../src/Pages/LedgerManagement"));
const BooksOfAccounts = lazy(() => import("../src/Pages/BooksOfAccounts"));
const DeveloperPayoutManagement = lazy(
  () => import("../src/Pages/DeveloperPayoutManagement"),
);
const OwnerInvestment = lazy(() => import("../src/Pages/OwnerInvestment"));
const BalanceSheet = lazy(() => import("../src/Pages/BalanceSheet"));
const FinancialYearManagement = lazy(
  () => import("../src/Pages/FinancialYearManagement"),
);
const TeamManagement = lazy(() => import("../src/Pages/TeamManagement"));
const Setting = lazy(() => import("../src/Pages/Setting"));
// const PageNotFound = lazy(() => import("./Website/Pages/PageNotFound"));

let loaderProgressSnapshot = 0;
let loaderAnimationStartAt = 0;
const LOADER_DURATION_MS = 1800;

export const Loading = () => {
  const [progressValue, setProgressValue] = useState(loaderProgressSnapshot);

  useEffect(() => {
    let animationId = null;

    if (!loaderAnimationStartAt) {
      loaderAnimationStartAt = performance.now();
    }

    const animate = (now) => {
      const elapsed = Math.max(0, now - loaderAnimationStartAt);
      const linear = Math.min(1, elapsed / LOADER_DURATION_MS);
      const eased = 1 - Math.pow(1 - linear, 3);
      const nextValue = Math.min(100, Math.round(eased * 100));

      loaderProgressSnapshot = Math.max(loaderProgressSnapshot, nextValue);
      setProgressValue((prev) => Math.max(prev, nextValue));

      if (nextValue >= 100) {
        loaderProgressSnapshot = 100;
      }

      if (linear < 1) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, []);

  return (
    <div className="preloader">
      <div className="preloader-stage" aria-hidden="true"></div>
      <div className="preloader-panel" role="status" aria-live="polite">
        <div className="preloader-chip" aria-hidden="true">
          <Player
            autoplay
            loop
            src="/Json/loading3.json"
            className="preloader-lottie"
          />
        </div>
        <p className="preloader-title text-success">MaxCode IT Services</p>
        <p className="preloader-subtitle">
          Preparing your accounting workspace
        </p>
        <div className="rangeWrapper" aria-hidden="true">
          <input
            style={{ "--base": "#6cc484" }}
            value={Math.max(0, Math.min(100, Math.round(progressValue)))}
            max="100"
            min="0"
            className="kawaii"
            type="range"
            readOnly
          />
        </div>
        <div className="preloader-wave" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
};

const getPostLoginRoute = () => {
  return getFirstAllowedRoute();
};

const ProtectedRoute = ({ children, authState }) => {
  const location = useLocation();

  const isChecking = authState?.isChecking ?? true;
  const isUserAuthenticated = authState?.isAuthenticated ?? false;

  if (isChecking) {
    return <Loading />;
  }

  if (!isUserAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const userInfo = getStoredUserInfo();
  const expectedPrefix = getRoleRoutePrefix(userInfo);
  const currentPrefixMatch = location.pathname.match(
    /^\/(admin|team|super)(?=\/|$)/i,
  );
  const currentPrefix = currentPrefixMatch?.[0]?.toLowerCase();

  if (currentPrefix && currentPrefix !== expectedPrefix) {
    const suffixPath = location.pathname.replace(/^\/(admin|team|super)/i, "");
    const nextPath = `${expectedPrefix}${suffixPath || "/dashboard"}`;
    return <Navigate to={nextPath} replace />;
  }

  return children;
};

const PublicRoute = ({ children, authState }) => {
  const isChecking = authState?.isChecking ?? true;
  const isUserAuthenticated = authState?.isAuthenticated ?? false;

  if (isChecking) {
    return <Loading />;
  }

  if (isUserAuthenticated) {
    return <Navigate to={getPostLoginRoute()} replace />;
  }

  return children;
};

const PermissionRoute = ({ moduleKey, children }) => {
  if (hasModuleAccess(moduleKey)) {
    return children;
  }

  const postLoginRoute = getPostLoginRoute();
  if (postLoginRoute !== "/login") {
    return <Navigate to={postLoginRoute} replace />;
  }

  return <Navigate to="/login" replace />;
};

const dashboardChildRoutes = (
  <>
    <Route
      index
      element={
        <PermissionRoute moduleKey="dashboard">
          <Suspense fallback={<Loading />}>
            <AdminDashboard />
          </Suspense>
        </PermissionRoute>
      }
    />
    <Route
      path="dashboard"
      element={
        <PermissionRoute moduleKey="dashboard">
          <Suspense fallback={<Loading />}>
            <AdminDashboard />
          </Suspense>
        </PermissionRoute>
      }
    />
    <Route
      path="client-management"
      element={
        <PermissionRoute moduleKey="clientManagement">
          <Suspense fallback={<Loading />}>
            <ClientManagement />
          </Suspense>
        </PermissionRoute>
      }
    />
    <Route
      path="lead-management"
      element={
        <PermissionRoute moduleKey="leadManagement">
          <Suspense fallback={<Loading />}>
            <LeadManagement />
          </Suspense>
        </PermissionRoute>
      }
    />
    <Route
      path="file-management"
      element={
        <PermissionRoute moduleKey="fileManagement">
          <Suspense fallback={<Loading />}>
            <FileManagement />
          </Suspense>
        </PermissionRoute>
      }
    />
    <Route
      path="qutation-management"
      element={
        <PermissionRoute moduleKey="qutationManagement">
          <Suspense fallback={<Loading />}>
            <QutationManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="vendor-management"
      element={
        <PermissionRoute moduleKey="vendorManagement">
          <Suspense fallback={<Loading />}>
            <VendorManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="staff-management"
      element={
        <PermissionRoute moduleKey="staffManagement">
          <Suspense fallback={<Loading />}>
            <StaffManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="team-management"
      element={
        <PermissionRoute moduleKey="teamManagement">
          <Suspense fallback={<Loading />}>
            <TeamManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="purchase-management"
      element={
        <PermissionRoute moduleKey="purchaseManagement">
          <Suspense fallback={<Loading />}>
            <PurchaseManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="company-expense-management"
      element={
        <PermissionRoute moduleKey="companyExpenseManagement">
          <Suspense fallback={<Loading />}>
            <CompanyExpenseManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="sales-management"
      element={
        <PermissionRoute moduleKey="salesManagement">
          <Suspense fallback={<Loading />}>
            <SalesManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="services-management"
      element={
        <PermissionRoute moduleKey="servicesManagement">
          <Suspense fallback={<Loading />}>
            <ServicesManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="project-management"
      element={
        <PermissionRoute moduleKey="projectManagement">
          <Suspense fallback={<Loading />}>
            <ProjectManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="project-details"
      element={
        <PermissionRoute moduleKey="projectDetails">
          <Suspense fallback={<Loading />}>
            <ProjectDetails />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="project-credentials"
      element={
        <PermissionRoute moduleKey="projectCredentials">
          <Suspense fallback={<Loading />}>
            <ProjectCredentials />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="my-software-credential"
      element={
        <PermissionRoute moduleKey="mySoftwareCredential">
          <Suspense fallback={<Loading />}>
            <MaxcodeCredential />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="otp-request-management"
      element={
        <PermissionRoute moduleKey="otpRequestManagement">
          <Suspense fallback={<Loading />}>
            <OtpRequestManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="rcm-management"
      element={
        <PermissionRoute moduleKey="rcmManagement">
          <Suspense fallback={<Loading />}>
            <RcmManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="credit-debit-notes-management"
      element={
        <PermissionRoute moduleKey="creditDebitNotesManagement">
          <Suspense fallback={<Loading />}>
            <CreditDebitNotesManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="ledger-management"
      element={
        <PermissionRoute moduleKey="ledgerManagement">
          <Suspense fallback={<Loading />}>
            <LedgerManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="books-of-accounts"
      element={
        <PermissionRoute moduleKey="booksOfAccounts">
          <Suspense fallback={<Loading />}>
            <BooksOfAccounts />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="developer-payout-management"
      element={
        <PermissionRoute moduleKey="developerPayoutManagement">
          <Suspense fallback={<Loading />}>
            <DeveloperPayoutManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="owner-investment"
      element={
        <PermissionRoute moduleKey="ownerInvestment">
          <Suspense fallback={<Loading />}>
            <OwnerInvestment />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="balance-sheet"
      element={
        <PermissionRoute moduleKey="balanceSheet">
          <Suspense fallback={<Loading />}>
            <BalanceSheet />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="financial-year-management"
      element={
        <PermissionRoute moduleKey="financialYearManagement">
          <Suspense fallback={<Loading />}>
            <FinancialYearManagement />
          </Suspense>
        </PermissionRoute>
      }
    />

    <Route
      path="setting"
      element={
        <PermissionRoute moduleKey="setting">
          <Suspense fallback={<Loading />}>
            <Setting />
          </Suspense>
        </PermissionRoute>
      }
    />
  </>
);

const App = () => {
  const [authState, setAuthState] = useState({
    isChecking: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    let mounted = true;

    const verifySession = async () => {
      const authenticated = await verifyServerSession();
      if (!mounted) return;

      setAuthState({
        isChecking: false,
        isAuthenticated: authenticated,
      });
    };

    verifySession();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />

        <Route
          path="/login"
          element={
            <PublicRoute authState={authState}>
              <Suspense fallback={<Loading />}>
                <Login onAuthSuccess={setAuthState} />
              </Suspense>
            </PublicRoute>
          }
        />

        {["/admin/*", "/team/*", "/super/*"].map((prefixPath) => (
          <Route
            key={prefixPath}
            path={prefixPath}
            element={
              <ProtectedRoute authState={authState}>
                <AdminDashboardLayout />
              </ProtectedRoute>
            }
          >
            {dashboardChildRoutes}
          </Route>
        ))}

        <Route
          path="*"
          element={
            authState.isChecking ? (
              <Loading />
            ) : (
              <Navigate
                to={authState.isAuthenticated ? getPostLoginRoute() : "/login"}
                replace
              />
            )
          }
        />

        {/* 404 Page */}
        {/* <Route
          path="*"
          element={
            <Suspense fallback={<Loading />}>
              <PageNotFound />
            </Suspense>
          }
        /> */}
      </Routes>
    </BrowserRouter>
  );
};

export default App;
