import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  LayoutDashboard,
  Package,
  Users,
  LogOut,
  ShoppingBag,
  Home,
  Shield,
  Wallet,
  Percent,
  Mail,
  TrendingUp,
} from "lucide-react";

const menuItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Users",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "Products",
    url: "/admin/products",
    icon: Package,
  },
  {
    title: "Splash Screen",
    url: "/admin/splash-screen",
    icon: Mail,
  },
  {
    title: "Crypto Wallet",
    url: "/admin/wallet",
    icon: Wallet,
  },
  {
    title: "Escrow",
    url: "/admin/escrow",
    icon: Shield,
  },
  {
    title: "Fees",
    url: "/admin/fees",
    icon: Percent,
  },
  {
    title: "Email Settings",
    url: "/admin/email",
    icon: Mail,
  },
  {
    title: "Payment Wallets",
    url: "/admin/payment-wallets",
    icon: Wallet,
  },
  {
    title: "Banner Slider",
    url: "/admin/banner-slider",
    icon: TrendingUp,
  },
];

export function AdminSidebar() {
  const [location, setLocation] = useLocation();
  const { setUser } = useAuth();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      setUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/admin">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-admin-home">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">ShopHub Admin</span>
          </div>
        </Link>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-admin-${item.title.toLowerCase()}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        <Link href="/">
          <Button variant="outline" className="w-full" data-testid="button-view-store">
            <Home className="h-4 w-4 mr-2" />
            View Store
          </Button>
        </Link>
        <Button
          variant="ghost"
          className="w-full"
          onClick={handleLogout}
          data-testid="button-admin-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
