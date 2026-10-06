import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Search, 
  Eye, 
  Pencil, 
  Trash2, 
  Shield, 
  ShieldOff, 
  Store, 
  User,
  Calendar,
  Globe,
  DollarSign,
  Package,
  Loader2,
  X
} from "lucide-react";

interface UserListItem {
  id: string;
  username: string;
  isAdmin: boolean;
  isMerchant: boolean;
  isBlocked: boolean;
  createdAt: string;
}

interface UserDetails {
  id: string;
  username: string;
  isAdmin: boolean;
  isMerchant: boolean;
  isBlocked: boolean;
  bio: string | null;
  avatarData: string | null;
  avatarType: string | null;
  merchantSince: string | null;
  registrationIp: string | null;
  createdAt: string;
  totalSpending: number;
  products: { id: string; name: string; price: string; createdAt: string }[];
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ username: "", password: "" });

  const { data: users, isLoading } = useQuery<UserListItem[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: userDetails, isLoading: isLoadingDetails } = useQuery<UserDetails>({
    queryKey: ["/api/admin/users", selectedUserId],
    enabled: !!selectedUserId,
  });

  const blockMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/block`);
    },
    onSuccess: () => {
      toast({ title: "User blocked successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUserId] });
      }
    },
    onError: () => toast({ title: "Failed to block user", variant: "destructive" }),
  });

  const unblockMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/unblock`);
    },
    onSuccess: () => {
      toast({ title: "User unblocked successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUserId] });
      }
    },
    onError: () => toast({ title: "Failed to unblock user", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { username?: string; password?: string } }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}`, data);
    },
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUserId] });
      }
      setEditDialogOpen(false);
      setEditForm({ username: "", password: "" });
    },
    onError: (error: Error) => toast({ title: error.message || "Failed to update user", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "User deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserId(null);
      setDeleteDialogOpen(false);
    },
    onError: (error: Error) => toast({ title: error.message || "Failed to delete user", variant: "destructive" }),
  });

  const deleteProductMutation = useMutation({
    mutationFn: async ({ userId, productId }: { userId: string; productId: string }) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}/products/${productId}`);
    },
    onSuccess: () => {
      toast({ title: "Product deleted successfully" });
      if (selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUserId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
    onError: () => toast({ title: "Failed to delete product", variant: "destructive" }),
  });

  const filteredUsers = users?.filter(user => 
    searchQuery ? user.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  user.username.toLowerCase().includes(searchQuery.toLowerCase()) : true
  ) || [];

  const handleEdit = (user: UserListItem) => {
    setEditForm({ username: user.username, password: "" });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedUserId) return;
    const data: { username?: string; password?: string } = {};
    
    // Only include username if it changed and is valid
    const trimmedUsername = editForm.username.trim();
    if (trimmedUsername && trimmedUsername !== userDetails?.username) {
      if (trimmedUsername.length < 3) {
        toast({ title: "Username must be at least 3 characters", variant: "destructive" });
        return;
      }
      data.username = trimmedUsername;
    }
    
    // Only include password if non-empty and valid
    const trimmedPassword = editForm.password.trim();
    if (trimmedPassword) {
      if (trimmedPassword.length < 6) {
        toast({ title: "Password must be at least 6 characters", variant: "destructive" });
        return;
      }
      data.password = trimmedPassword;
    }
    
    if (Object.keys(data).length === 0) {
      toast({ title: "No changes to save", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ userId: selectedUserId, data });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-admin-users-title">Users Management</h1>
        <p className="text-muted-foreground">Manage user accounts, edit details, and view user information</p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-users"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">User List ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : filteredUsers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No users found</p>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={`p-3 rounded-md border cursor-pointer transition-colors ${
                    selectedUserId === user.id ? "border-primary bg-primary/5" : "hover-elevate"
                  }`}
                  onClick={() => setSelectedUserId(user.id)}
                  data-testid={`user-item-${user.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium" data-testid={`text-username-${user.id}`}>{user.username}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {user.isAdmin && <Badge variant="default" className="text-xs">Admin</Badge>}
                      {user.isMerchant && <Badge variant="secondary" className="text-xs">Merchant</Badge>}
                      {user.isBlocked && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">ID: {user.id}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5" />
              User Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedUserId ? (
              <p className="text-muted-foreground text-center py-12">Select a user to view details</p>
            ) : isLoadingDetails ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : userDetails ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    {userDetails.avatarData ? (
                      <img src={userDetails.avatarData} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-lg" data-testid="text-detail-username">{userDetails.username}</h3>
                      <p className="text-xs text-muted-foreground">ID: {userDetails.id}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {!userDetails.isAdmin && (
                      <>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleEdit(userDetails)}
                          data-testid="button-edit-user"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => setDeleteDialogOpen(true)}
                          data-testid="button-delete-user"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {userDetails.isAdmin && <Badge variant="default">Admin</Badge>}
                  {userDetails.isMerchant && <Badge variant="secondary">Merchant</Badge>}
                  {userDetails.isBlocked ? (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => unblockMutation.mutate(userDetails.id)}
                      disabled={unblockMutation.isPending}
                      data-testid="button-unblock-user"
                    >
                      <ShieldOff className="h-4 w-4 mr-1" />
                      Unblock
                    </Button>
                  ) : !userDetails.isAdmin && (
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={() => blockMutation.mutate(userDetails.id)}
                      disabled={blockMutation.isPending}
                      data-testid="button-block-user"
                    >
                      <Shield className="h-4 w-4 mr-1" />
                      Block
                    </Button>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Created</p>
                      <p className="font-medium" data-testid="text-created-at">
                        {new Date(userDetails.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Registration IP</p>
                      <p className="font-medium" data-testid="text-registration-ip">
                        {userDetails.registrationIp || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Total Spending</p>
                      <p className="font-medium" data-testid="text-total-spending">
                        ${userDetails.totalSpending.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {userDetails.isMerchant && userDetails.merchantSince && (
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground text-xs">Merchant Since</p>
                        <p className="font-medium">
                          {new Date(userDetails.merchantSince).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {userDetails.bio && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-1">Bio</p>
                      <p className="text-sm text-muted-foreground">{userDetails.bio}</p>
                    </div>
                  </>
                )}

                {userDetails.isMerchant && userDetails.products.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Products ({userDetails.products.length})
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {userDetails.products.map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                            data-testid={`product-item-${product.id}`}
                          >
                            <div>
                              <p className="font-medium text-sm">{product.name}</p>
                              <p className="text-xs text-muted-foreground">${Number(product.price).toFixed(2)}</p>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteProductMutation.mutate({ 
                                userId: userDetails.id, 
                                productId: product.id 
                              })}
                              disabled={deleteProductMutation.isPending}
                              data-testid={`button-delete-product-${product.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                data-testid="input-edit-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">New Password (leave empty to keep current)</Label>
              <Input
                id="password"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="Enter new password..."
                data-testid="input-edit-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete this user? This action cannot be undone. 
            All their data including orders, reviews, and products will be permanently deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => selectedUserId && deleteMutation.mutate(selectedUserId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
