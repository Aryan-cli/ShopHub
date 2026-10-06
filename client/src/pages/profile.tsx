import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Store, Camera, Loader2, ShoppingBag, Users, Bell, Mail, MessageSquare, ShoppingCart, DollarSign, Wallet, Lock, Eye, EyeOff } from "lucide-react";

interface NotificationSettings {
  email: string | null;
  notificationsEnabled: boolean;
  chatNotifications: boolean;
  purchaseNotifications: boolean;
  saleNotifications: boolean;
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarData || null);
  
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [notificationEmail, setNotificationEmail] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [chatNotifications, setChatNotifications] = useState(true);
  const [purchaseNotifications, setPurchaseNotifications] = useState(true);
  const [saleNotifications, setSaleNotifications] = useState(true);

  const { data: orders } = useQuery({
    queryKey: ["/api/orders"],
    enabled: !!user,
  });

  const { data: following } = useQuery({
    queryKey: ["/api/following"],
    enabled: !!user,
  });

  const { data: notificationSettings, isLoading: loadingNotifications } = useQuery<NotificationSettings>({
    queryKey: ["/api/notification-settings"],
    enabled: !!user,
  });

  useEffect(() => {
    if (notificationSettings) {
      setNotificationEmail(notificationSettings.email || "");
      setNotificationsEnabled(notificationSettings.notificationsEnabled);
      setChatNotifications(notificationSettings.chatNotifications);
      setPurchaseNotifications(notificationSettings.purchaseNotifications);
      setSaleNotifications(notificationSettings.saleNotifications);
    }
  }, [notificationSettings]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { bio?: string; avatarData?: string; avatarType?: string }) => {
      const response = await apiRequest("PATCH", "/api/users/profile", data);
      return response.json();
    },
    onSuccess: (data) => {
      setUser({ ...user!, ...data });
      toast({ title: "Profile updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const becomeMerchantMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/users/become-merchant");
      return response.json();
    },
    onSuccess: (data) => {
      setUser({ ...user!, ...data });
      toast({ title: "You are now a merchant!", description: "You can start adding products." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: () => {
      toast({ title: "Failed to become merchant", variant: "destructive" });
    },
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: Partial<NotificationSettings>) => {
      const response = await apiRequest("PATCH", "/api/notification-settings", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Notification settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/notification-settings"] });
    },
    onError: () => {
      toast({ title: "Failed to save notification settings", variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/users/change-password", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsPasswordDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to change password", description: error.message, variant: "destructive" });
    },
  });

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "New password and confirm password must be the same.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleSaveNotifications = () => {
    updateNotificationsMutation.mutate({
      email: notificationEmail || null,
      notificationsEnabled,
      chatNotifications,
      purchaseNotifications,
      saleNotifications,
    });
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setAvatarPreview(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      bio,
      avatarData: avatarPreview || undefined,
      avatarType: avatarPreview ? "image/jpeg" : undefined,
    });
  };

  if (!user) {
    setLocation("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8" data-testid="text-page-title">My Profile</h1>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your profile photo and bio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    {avatarPreview ? (
                      <AvatarImage src={avatarPreview} alt={user.username} />
                    ) : null}
                    <AvatarFallback className="text-2xl">{user.username.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer">
                    <Camera className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                      data-testid="input-avatar"
                    />
                  </label>
                </div>
                <div>
                  <h2 className="text-xl font-semibold" data-testid="text-username">{user.username}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    {user.isAdmin && <Badge variant="secondary">Admin</Badge>}
                    {user.isMerchant && <Badge>Merchant</Badge>}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bio</label>
                <Textarea
                  placeholder="Tell us about yourself..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="resize-none"
                  data-testid="input-bio"
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                  {updateProfileMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsPasswordDialogOpen(true)}
                  data-testid="button-open-change-password"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>

          <Dialog
            open={isPasswordDialogOpen}
            onOpenChange={(open) => {
              setIsPasswordDialogOpen(open);
              if (!open) {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setShowCurrentPassword(false);
                setShowNewPassword(false);
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Change Password
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Current Password</label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      placeholder="Enter current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      data-testid="input-current-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      data-testid="button-toggle-current-password"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">New Password</label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Enter new password (min 6 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      data-testid="input-new-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      data-testid="button-toggle-new-password"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm New Password</label>
                  <Input
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    data-testid="input-confirm-password"
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={handleChangePassword}
                  disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Change Password
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {!user.isMerchant && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Become a Merchant
                </CardTitle>
                <CardDescription>
                  Start selling your products on ShopHub. As a merchant, you can add products, manage inventory, and interact with customers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => becomeMerchantMutation.mutate()}
                  disabled={becomeMerchantMutation.isPending}
                  data-testid="button-become-merchant"
                >
                  {becomeMerchantMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Store className="mr-2 h-4 w-4" />
                      Become a Merchant
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {user.isMerchant && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Merchant Dashboard
                </CardTitle>
                <CardDescription>
                  Manage your products and view your sales
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setLocation("/merchant")} data-testid="button-go-merchant">
                  <Store className="mr-2 h-4 w-4" />
                  Go to Merchant Dashboard
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                USDT Wallet
              </CardTitle>
              <CardDescription>
                Manage your BEP-20 USDT wallet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation("/wallet-management")} data-testid="button-open-wallet">
                <Wallet className="mr-2 h-4 w-4" />
                Open a Wallet
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Configure email notifications for important updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="notification-email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address
                </Label>
                <Input
                  id="notification-email"
                  type="email"
                  placeholder="Enter your email for notifications"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  data-testid="input-notification-email"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifications-enabled" className="text-base">Enable Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive email notifications when you're offline</p>
                </div>
                <Switch
                  id="notifications-enabled"
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                  data-testid="switch-notifications-enabled"
                />
              </div>

              {notificationsEnabled && (
                <div className="space-y-4 pl-4 border-l-2 border-muted">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="chat-notifications">Chat Messages</Label>
                    </div>
                    <Switch
                      id="chat-notifications"
                      checked={chatNotifications}
                      onCheckedChange={setChatNotifications}
                      data-testid="switch-chat-notifications"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="purchase-notifications">Purchase Confirmations</Label>
                    </div>
                    <Switch
                      id="purchase-notifications"
                      checked={purchaseNotifications}
                      onCheckedChange={setPurchaseNotifications}
                      data-testid="switch-purchase-notifications"
                    />
                  </div>

                  {user.isMerchant && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="sale-notifications">Sale Notifications</Label>
                      </div>
                      <Switch
                        id="sale-notifications"
                        checked={saleNotifications}
                        onCheckedChange={setSaleNotifications}
                        data-testid="switch-sale-notifications"
                      />
                    </div>
                  )}
                </div>
              )}

              <Button 
                onClick={handleSaveNotifications} 
                disabled={updateNotificationsMutation.isPending || !notificationEmail}
                data-testid="button-save-notifications"
              >
                {updateNotificationsMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Notification Settings"
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                My Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orders && orders.length > 0 ? (
                <div className="space-y-3">
                  {orders.map((order: any) => (
                    <div key={order.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <p className="font-medium">Order #{order.id.slice(0, 8)}</p>
                        <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">${order.totalAmount}</p>
                        <Badge variant="outline">{order.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No orders yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Following Merchants
              </CardTitle>
            </CardHeader>
            <CardContent>
              {following && following.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {following.map((merchant: any) => (
                    <div
                      key={merchant.id}
                      className="flex flex-col items-center p-4 border rounded-md hover-elevate cursor-pointer"
                      onClick={() => setLocation(`/user/${merchant.id}`)}
                    >
                      <Avatar className="h-12 w-12 mb-2">
                        {merchant.avatarData ? (
                          <AvatarImage src={merchant.avatarData} alt={merchant.username} />
                        ) : null}
                        <AvatarFallback>{merchant.username.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-sm text-center">{merchant.username}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Not following any merchants yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
