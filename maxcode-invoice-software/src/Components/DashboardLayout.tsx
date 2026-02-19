// User Dashboard/Components/DashboardLayout.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import DashboardNavbar from './DashboardNavbar';

const DashboardLayout = () => {
  return (
    <DashboardNavbar>
      <Outlet /> {/* This will render the matched child route */}
    </DashboardNavbar>
  );
};

export default DashboardLayout;