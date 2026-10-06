import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { SplashScreenComponent } from "@/components/splash-screen";

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ProductDetail from "@/pages/product-detail";
import Profile from "@/pages/profile";
import Favorites from "@/pages/favorites";
import Messages from "@/pages/messages";
import Forum from "@/pages/forum";
import ForumPost from "@/pages/forum-post";
import UserProfile from "@/pages/user-profile";
import MerchantDashboard from "@/pages/merchant/dashboard";
import MerchantWallet from "@/pages/merchant/wallet";
import WalletManagement from "@/pages/wallet-management";
import EscrowPage from "@/pages/escrow";
import NotFound from "@/pages/not-found";

import { AdminLayout } from "@/pages/admin/layout";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminProducts from "@/pages/admin/products";
import AdminProductForm from "@/pages/admin/product-form";
import AdminEscrow from "@/pages/admin/escrow";
import AdminWallet from "@/pages/admin/wallet";
import AdminFees from "@/pages/admin/fees";
import AdminUsers from "@/pages/admin/users";
import AdminEmail from "@/pages/admin/email";
import AdminSplashScreen from "@/pages/admin/splash-screen";
import PaymentWalletsAdmin from "@/pages/admin/payment-wallets";
import AdminBannerSlider from "@/pages/admin/banner-slider";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/product/:id" component={ProductDetail} />
      <Route path="/profile" component={Profile} />
      <Route path="/favorites" component={Favorites} />
      <Route path="/messages" component={Messages} />
      <Route path="/forum" component={Forum} />
      <Route path="/forum/:id" component={ForumPost} />
      <Route path="/user/:id" component={UserProfile} />
      <Route path="/merchant" component={MerchantDashboard} />
      <Route path="/merchant/wallet" component={MerchantWallet} />
      <Route path="/wallet-management" component={WalletManagement} />
      <Route path="/escrow" component={EscrowPage} />
      <Route path="/admin">
        <AdminLayout>
          <AdminDashboard />
        </AdminLayout>
      </Route>
      <Route path="/admin/products">
        <AdminLayout>
          <AdminProducts />
        </AdminLayout>
      </Route>
      <Route path="/admin/products/new">
        <AdminLayout>
          <AdminProductForm />
        </AdminLayout>
      </Route>
      <Route path="/admin/products/:id/edit">
        <AdminLayout>
          <AdminProductForm />
        </AdminLayout>
      </Route>
      <Route path="/admin/escrow">
        <AdminLayout>
          <AdminEscrow />
        </AdminLayout>
      </Route>
      <Route path="/admin/wallet">
        <AdminLayout>
          <AdminWallet />
        </AdminLayout>
      </Route>
      <Route path="/admin/fees">
        <AdminLayout>
          <AdminFees />
        </AdminLayout>
      </Route>
      <Route path="/admin/users">
        <AdminLayout>
          <AdminUsers />
        </AdminLayout>
      </Route>
      <Route path="/admin/email">
        <AdminLayout>
          <AdminEmail />
        </AdminLayout>
      </Route>
      <Route path="/admin/splash-screen">
        <AdminLayout>
          <AdminSplashScreen />
        </AdminLayout>
      </Route>
      <Route path="/admin/payment-wallets">
        <AdminLayout>
          <PaymentWalletsAdmin />
        </AdminLayout>
      </Route>
      <Route path="/admin/banner-slider">
        <AdminLayout>
          <AdminBannerSlider />
        </AdminLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <SplashScreenComponent />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

// Add this import at the top with other admin pages
// import PaymentWalletsAdmin from '@/pages/admin/payment-wallets';

// Add this route in your admin routes section:
// { path: "/admin/payment-wallets", component: () => import('@/pages/admin/payment-wallets').then(m => <m.default />) }
