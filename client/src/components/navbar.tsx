import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/auth";
import { ShoppingBag, User, LogOut, Settings, Heart, MessageCircle, Users, Store, Search, Shield, Wallet } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navbar() {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Query for unread message count
  const { data: unreadData, refetch: refetchUnread } = useQuery<{ count: number }>({
    queryKey: ["/api/unread-count"],
    enabled: !!user,
    refetchInterval: 30000,
  });

  // WebSocket connection for real-time notifications
  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?userId=${user.id}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "new_message") {
        setHasNewMessage(true);
        refetchUnread();
        // Reset animation after 3 seconds
        setTimeout(() => setHasNewMessage(false), 3000);
      }
    };

    wsRef.current = ws;
    
    return () => {
      ws.close();
    };
  }, [user, refetchUnread]);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const unreadCount = unreadData?.count || 0;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6 w-full">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl hidden sm:inline">ShopHub</span>
          </div>
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-md hidden md:flex">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search products..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
        </form>

        <div className="flex items-center gap-1 flex-wrap">
          <Link href="/forum">
            <Button variant="ghost" size="icon" data-testid="button-forum">
              <Users className="h-5 w-5" />
            </Button>
          </Link>
          
          <ThemeToggle />
          
          {user ? (
            <>
              <Link href="/favorites">
                <Button variant="ghost" size="icon" data-testid="button-favorites">
                  <Heart className="h-5 w-5" />
                </Button>
              </Link>
              
              <Link href="/messages">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`relative ${hasNewMessage ? "animate-pulse" : ""}`}
                  data-testid="button-messages"
                >
                  <MessageCircle className={`h-5 w-5 ${hasNewMessage ? "text-primary" : ""}`} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center bg-primary text-primary-foreground text-xs rounded-full">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-profile-menu">
                    <Avatar className="h-8 w-8">
                      {user.avatarData ? (
                        <AvatarImage src={user.avatarData} alt={user.username} />
                      ) : null}
                      <AvatarFallback>{user.username.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setLocation("/profile")} className="cursor-pointer" data-testid="link-profile">
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => setLocation("/escrow")} className="cursor-pointer" data-testid="link-escrow">
                    <Shield className="h-4 w-4 mr-2" />
                    My Escrow Orders
                  </DropdownMenuItem>
                  
                  {user.isMerchant && (
                    <>
                      <DropdownMenuItem onClick={() => setLocation("/merchant")} className="cursor-pointer" data-testid="link-merchant">
                        <Store className="h-4 w-4 mr-2" />
                        Merchant Dashboard
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/merchant/wallet")} className="cursor-pointer" data-testid="link-wallet">
                        <Wallet className="h-4 w-4 mr-2" />
                        Wallet
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  {user.isAdmin && (
                    <DropdownMenuItem onClick={() => setLocation("/admin")} className="cursor-pointer" data-testid="link-admin">
                      <Settings className="h-4 w-4 mr-2" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer" data-testid="button-logout">
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/login">
              <Button variant="default" size="sm" data-testid="button-login">
                <User className="h-4 w-4 mr-2" />
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
