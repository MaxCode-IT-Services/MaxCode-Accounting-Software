// App.js
import React, { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import AdminDashboardLayout from "../src/Components/DashboardLayout";
import Home from "../src/Home";
import Login from "../src/Pages/Login";

// Lazy load User Dashboard pages
const AdminDashboard = lazy(() => import("../src/Pages/Dashboard.jsx"));
const ClientManagement = lazy(() => import("../src/Pages/ClientManagement"));
const VendorManagement = lazy(() => import("../src/Pages/VendorManagement"));
const StaffManagement = lazy(() => import("../src/Pages/StaffManagement"));
const PurchaseManagement = lazy(
  () => import("../src/Pages/PurchaseManagement"),
);
const SalesManagement = lazy(() => import("../src/Pages/SalesManagement"));
const ServicesManagement = lazy(
  () => import("../src/Pages/ServicesManagement"),
);
const ProjectManagement = lazy(() => import("../src/Pages/ProjectManagement"));
const ProjectDetails = lazy(() => import("../src/Pages/ProjectDetails"));
const RcmManagement = lazy(() => import("../src/Pages/RcmManagement"));
const LedgerManagement = lazy(() => import("../src/Pages/LedgerManagement"));
const DetailedLedgerManagement = lazy(
  () => import("../src/Pages/DetailedLedgerManagement"),
);
const DeveloperPayoutManagement = lazy(
  () => import("../src/Pages/DeveloperPayoutManagement"),
);
const BalanceSheet = lazy(() => import("../src/Pages/BalanceSheet"));
const FinancialYearManagement = lazy(
  () => import("../src/Pages/FinancialYearManagement"),
);
const Setting = lazy(() => import("../src/Pages/Setting"));
// const PageNotFound = lazy(() => import("./Website/Pages/PageNotFound"));

export const Loading = () => (
  <div className="preloader">
    <div className="loader">
      <div className="shadow"></div>
      <div className="box"></div>
    </div>
  </div>
);

const isAuthenticated = () => {
  const token = localStorage.getItem("access_token");
  const authFlag = localStorage.getItem("maxcode_auth") === "true";
  return Boolean(token) && authFlag;
};

const ProtectedRoute = ({ children }) => {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  if (isAuthenticated()) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/login"
          element={
            <PublicRoute>
              <Suspense fallback={<Loading />}>
                <Login />
              </Suspense>
            </PublicRoute>
          }
        />

        <Route
          path="/admin/*"
          element={
            <ProtectedRoute>
              <AdminDashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<Loading />}>
                <AdminDashboard />
              </Suspense>
            }
          />
          <Route
            path="dashboard"
            element={
              <Suspense fallback={<Loading />}>
                <AdminDashboard />
              </Suspense>
            }
          />
          <Route
            path="client-management"
            element={
              <Suspense fallback={<Loading />}>
                <ClientManagement />
              </Suspense>
            }
          />
          <Route
            path="vendor-management"
            element={
              <Suspense fallback={<Loading />}>
                <VendorManagement />
              </Suspense>
            }
          />

          <Route
            path="staff-management"
            element={
              <Suspense fallback={<Loading />}>
                <StaffManagement />
              </Suspense>
            }
          />

          <Route
            path="purchase-management"
            element={
              <Suspense fallback={<Loading />}>
                <PurchaseManagement />
              </Suspense>
            }
          />

          <Route
            path="sales-management"
            element={
              <Suspense fallback={<Loading />}>
                <SalesManagement />
              </Suspense>
            }
          />

          <Route
            path="services-management"
            element={
              <Suspense fallback={<Loading />}>
                <ServicesManagement />
              </Suspense>
            }
          />

          <Route
            path="project-management"
            element={
              <Suspense fallback={<Loading />}>
                <ProjectManagement />
              </Suspense>
            }
          />

          <Route
            path="project-details"
            element={
              <Suspense fallback={<Loading />}>
                <ProjectDetails />
              </Suspense>
            }
          />

          <Route
            path="rcm-management"
            element={
              <Suspense fallback={<Loading />}>
                <RcmManagement />
              </Suspense>
            }
          />

          <Route
            path="ledger-management"
            element={
              <Suspense fallback={<Loading />}>
                <LedgerManagement />
              </Suspense>
            }
          />

          <Route
            path="detailed-ledger-management"
            element={
              <Suspense fallback={<Loading />}>
                <DetailedLedgerManagement />
              </Suspense>
            }
          />

          <Route
            path="developer-payout-management"
            element={
              <Suspense fallback={<Loading />}>
                <DeveloperPayoutManagement />
              </Suspense>
            }
          />

          <Route
            path="balance-sheet"
            element={
              <Suspense fallback={<Loading />}>
                <BalanceSheet />
              </Suspense>
            }
          />

          <Route
            path="financial-year-management"
            element={
              <Suspense fallback={<Loading />}>
                <FinancialYearManagement />
              </Suspense>
            }
          />

          <Route
            path="Setting"
            element={
              <Suspense fallback={<Loading />}>
                <Setting />
              </Suspense>
            }
          />
        </Route>

        <Route
          path="*"
          element={
            <Navigate
              to={isAuthenticated() ? "/admin/dashboard" : "/login"}
              replace
            />
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
