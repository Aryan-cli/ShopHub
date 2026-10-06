import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/product-card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronLeft, Store, Users, MessageCircle, UserPlus, Loader2, UserMinus } from "lucide-react";
import type { Product } from "@shared/schema";

interface UserProfile {
  id: string;
  username: string;
  isMerchant: boolean;
  bio: string | null;
  avatarData: string | null;
  avatarType: string | null;
  merchantSince: string | null;
  followerCount: number;
  isFollowing: boolean;
}

interface ProductWithRatings extends Product {
  averageRating: number;
  reviewCount: number;
}

export default function UserProfilePage() {
  const [, params] = useRoute("/user/:id");
  const userId = params?.id;
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: userProfile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/users", userId],
    enabled: !!userId,
  });

  const { data: products, isLoading: productsLoading } = useQuery<ProductWithRatings[]>({
    queryKey: ["/api/users", userId, "products"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/products`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    enabled: !!userId && !!userProfile?.isMerchant,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/merchants/${userId}/follow`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/following"] });
    },
    onError: () => {
      toast({ title: "Please login to follow merchants", variant: "destructive" });
    },
  });

  const startConversationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/conversations", { recipientId: userId });
      return response.json();
    },
    onSuccess: () => {
      setLocation("/messages");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start conversation", description: error.message, variant: "destructive" });
    },
  });

  const sendFriendRequestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/friend-requests", { receiverId: userId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Friend request sent" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send friend request", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container px-4 md:px-8 py-8 max-w-4xl">
          <Skeleton className="h-64" />
        </main>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container px-4 md:px-8 py-8 max-w-4xl text-center">
          <p>User not found</p>
          <Link href="/">
            <Button className="mt-4">Back to Home</Button>
          </Link>
        </main>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === userProfile.id;
  const isFollowing = userProfile.isFollowing;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8 max-w-4xl">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <Avatar className="h-24 w-24">
                {userProfile.avatarData ? (
                  <AvatarImage src={userProfile.avatarData} alt={userProfile.username} />
                ) : null}
                <AvatarFallback className="text-2xl">{userProfile.username.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold" data-testid="text-username">{userProfile.username}</h1>
                  {userProfile.isMerchant && (
                    <Badge>
                      <Store className="h-3 w-3 mr-1" />
                      Merchant
                    </Badge>
                  )}
                </div>
                
                {userProfile.bio && (
                  <p className="mt-2 text-muted-foreground">{userProfile.bio}</p>
                )}
                
                {userProfile.isMerchant && (
                  <div className="flex items-center gap-4 mt-3 justify-center sm:justify-start">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span className="font-semibold">{userProfile.followerCount}</span>
                      <span className="text-muted-foreground">followers</span>
                    </div>
                    {userProfile.merchantSince && (
                      <span className="text-sm text-muted-foreground">
                        Merchant since {new Date(userProfile.merchantSince).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                {!isOwnProfile && currentUser && (
                  <div className="flex items-center gap-2 mt-4 justify-center sm:justify-start flex-wrap">
                    {userProfile.isMerchant && (
                      <Button
                        variant={isFollowing ? "outline" : "default"}
                        onClick={() => followMutation.mutate()}
                        disabled={followMutation.isPending}
                        data-testid="button-follow"
                      >
                        {followMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isFollowing ? (
                          <>
                            <UserMinus className="h-4 w-4 mr-2" />
                            Unfollow
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Follow
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => startConversationMutation.mutate()}
                      disabled={startConversationMutation.isPending}
                      data-testid="button-message"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => sendFriendRequestMutation.mutate()}
                      disabled={sendFriendRequestMutation.isPending}
                      data-testid="button-add-friend"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Friend
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {userProfile.isMerchant && (
          <div>
            <h2 className="text-xl font-semibold mb-4">
              Products by {userProfile.username}
            </h2>
            {productsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-64" />
                ))}
              </div>
            ) : products && products.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    averageRating={product.averageRating}
                    reviewCount={product.reviewCount}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No products listed yet.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
