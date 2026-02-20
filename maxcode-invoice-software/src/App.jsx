// App.js
import React, { lazy, Suspense, useEffect, useState } from "react";
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
import { hasModuleAccess } from "../src/utils/permissions";
import { verifyServerSession } from "../src/utils/api";

// Lazy load User Dashboard pages
const AdminDashboard = lazy(() => import("../src/Pages/Dashboard.jsx"));
const ClientManagement = lazy(() => import("../src/Pages/ClientManagement"));
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
const TeamManagement = lazy(() => import("../src/Pages/TeamManagement"));
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

const isAuthenticated = () => localStorage.getItem("maxcode_auth") === "true";

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const verifySession = async () => {
      const authenticated = await verifyServerSession();
      if (mounted) {
        setIsAuthenticated(authenticated);
        setIsChecking(false);
      }
    };

    verifySession();

    return () => {
      mounted = false;
    };
  }, []);

  if (isChecking) {
    return <Loading />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const verifySession = async () => {
      const authenticated = await verifyServerSession();
      if (mounted) {
        setIsAuthenticated(authenticated);
        setIsChecking(false);
      }
    };

    verifySession();

    return () => {
      mounted = false;
    };
  }, []);

  if (isChecking) {
    return <Loading />;
  }

  if (isAuthenticated) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
};

const PermissionRoute = ({ moduleKey, children }) => {
  if (hasModuleAccess(moduleKey)) {
    return children;
  }

  if (hasModuleAccess("dashboard")) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
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
            path="detailed-ledger-management"
            element={
              <PermissionRoute moduleKey="detailedLedgerManagement">
                <Suspense fallback={<Loading />}>
                  <DetailedLedgerManagement />
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
            path="Setting"
            element={
              <PermissionRoute moduleKey="setting">
                <Suspense fallback={<Loading />}>
                  <Setting />
                </Suspense>
              </PermissionRoute>
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
          path="**"
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
