import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/navbar";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Package, ChevronLeft, ShoppingCart, Loader2, MessageSquare, Heart, Eye, Store, Users, MessageCircle, Bitcoin, Copy, Shield, Clock, CheckCircle, AlertTriangle, Coins, ChevronDown, ChevronUp, ExternalLink, ZoomIn, ZoomOut, X, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SiBinance } from "react-icons/si";
import type { Product, Review } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import QRCode from "react-qr-code";

const reviewSchema = z.object({
  rating: z.number().optional(),
  comment: z.string().min(3, "Comment must be at least 3 characters"),
});

type ReviewForm = z.infer<typeof reviewSchema>;

interface ExtendedReview extends Review {
  isVerifiedBuyer: boolean;
  isMerchantReply: boolean;
}

interface MerchantInfo {
  id: string;
  username: string;
  avatarData: string | null;
  avatarType: string | null;
  bio: string | null;
  followerCount: number;
  isFollowing: boolean;
}

interface ProductWithReviews extends Product {
  reviews: ExtendedReview[];
  averageRating: number;
  reviewCount: number;
  isFavorite: boolean;
  merchant: MerchantInfo | null;
}

interface EscrowOrder {
  id: string;
  orderId: string;
  buyerId: string;
  merchantId: string;
  coinSymbol: string;
  cryptoAmount: number;
  btcAmount: number;
  usdAmount: string;
  depositAddress: string;
  status: string;
  escrowStartedAt: string | null;
  escrowExpiresAt: string | null;
  cryptoRate?: number;
  btcRate?: number;
  bnbRate?: number;
}

interface PaymentCoin {
  id: string;
  symbol: string;
  name: string;
  network: string;
  isEnabled: boolean;
  explorerUrl: string;
}

interface PurchaseSnapshot {
  id: string;
  escrowOrderId: string;
  productName: string;
  productDescription: string;
  productImages: string[];
  afterBuyMessage: string | null;
  afterBuyButtonLabel: string | null;
  afterBuyButtonUrl: string | null;
}

interface PurchaseStatus {
  hasPurchased: boolean;
  escrowId?: string;
  escrowStatus?: string;
  snapshot?: PurchaseSnapshot;
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const expires = new Date(expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setTimeLeft("Released to merchant");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
      <Clock className="h-4 w-4" />
      <span className="font-mono font-medium">{timeLeft}</span>
    </div>
  );
}

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const productId = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedRating, setSelectedRating] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [escrowOrder, setEscrowOrder] = useState<EscrowOrder | null>(null);
  const [buyerRefundAddress, setBuyerRefundAddress] = useState("");
  const [selectedCoin, setSelectedCoin] = useState<string>("USDT");
  const [purchasedOpen, setPurchasedOpen] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "manual">("manual");
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState("");
  // Fetch available payment coins
  const { data: paymentCoins = [] } = useQuery<PaymentCoin[]>({
    queryKey: ["/api/payment-coins"],
  });

  // Fetch fee settings for transparency
  const { data: feeSettings } = useQuery<{ globalFeePercent: number }>({
    queryKey: ["/api/fee-settings"],
  });

  // Fetch wallet balance
  const { data: userWallet } = useQuery({
    queryKey: ["/api/wallet/get"],
    enabled: !!user,
  });

  useEffect(() => {
    if (userWallet) {
      setWalletBalance(userWallet.usdtBalance || 0);
    }
  }, [userWallet]);

  // Check if user has purchased this product (released escrow)
  const { data: purchaseStatus } = useQuery<PurchaseStatus>({
    queryKey: [`/api/escrow/product/${productId}/released`],
    enabled: !!productId && !!user,
  });

  const { data: product, isLoading } = useQuery<ProductWithReviews>({
    queryKey: ["/api/products", productId],
    enabled: !!productId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const form = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: 0,
      comment: "",
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (data: ReviewForm) => {
      const response = await apiRequest("POST", `/api/products/${productId}/reviews`, {
        ...data,
        rating: selectedRating > 0 ? selectedRating : undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Comment submitted",
        description: "Thank you for your feedback!",
      });
      form.reset();
      setSelectedRating(0);
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const editReviewMutation = useMutation({
    mutationFn: async ({ reviewId, comment }: { reviewId: string; comment: string }) => {
      const response = await apiRequest("PATCH", `/api/reviews/${reviewId}`, { comment });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Comment updated" });
      setEditingReviewId(null);
      setEditingComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const deleteReviewMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const response = await apiRequest("DELETE", `/api/reviews/${reviewId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Comment deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/products/${productId}/favorite`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    },
    onError: () => {
      toast({ title: "Please login to add favorites", variant: "destructive" });
    },
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/merchants/${product?.merchant?.id}/follow`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/following"] });
    },
    onError: () => {
      toast({ title: "Please login to follow merchants", variant: "destructive" });
    },
  });

  const startConversationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/conversations", { recipientId: product?.merchant?.id });
      return response.json();
    },
    onSuccess: () => {
      setLocation("/messages");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start conversation", description: error.message, variant: "destructive" });
    },
  });

  const buyMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Create the order
      const orderResponse = await apiRequest("POST", "/api/orders", {
        items: [{ productId, quantity: 1 }],
      });
      const order = await orderResponse.json();
      
      // Step 2: Create the escrow order with selected coin
      const escrowResponse = await apiRequest("POST", "/api/escrow/create", {
        orderId: order.id,
        merchantId: product?.merchant?.id,
        usdAmount: Number(product?.price),
        buyerRefundAddress: buyerRefundAddress || null,
        coinSymbol: selectedCoin,
      });
      const escrow = await escrowResponse.json();
      return escrow;
    },
    onSuccess: (escrow) => {
      setEscrowOrder(escrow);
      setShowPaymentModal(true);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
    },
    onError: (error: Error) => {
      toast({ title: "Purchase failed", description: error.message || "Please login to buy", variant: "destructive" });
    },
  });


  const copyAddress = () => {
    if (escrowOrder) {
      navigator.clipboard.writeText(escrowOrder.depositAddress);
      toast({ title: "Copied!", description: "Deposit address copied to clipboard" });
    }
  };

  const verifyPaymentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/escrow/${escrowOrder?.id}/verify-by-txhash`, {
        txHash,
        buyerWalletAddress: buyerRefundAddress || null,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Payment Verified!",
        description: `Your ${escrowOrder?.coinSymbol || "crypto"} payment has been confirmed and is now in escrow.`,
      });
      setEscrowOrder(data.escrow);
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      queryClient.invalidateQueries({ queryKey: [`/api/escrow/product/${productId}/released`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Not Found",
        description: error.message || "Make sure you entered the correct transaction hash and wallet address",
        variant: "destructive",
      });
    },
  });

  const walletPaymentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/escrow/${escrowOrder?.id}/pay-with-wallet`, {
        amount: Number(product?.price),
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Payment Successful!",
        description: `Your ${escrowOrder?.cryptoAmount || 0} USDT has been sent and is now in escrow.`,
      });
      setEscrowOrder(data.escrow);
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      queryClient.invalidateQueries({ queryKey: [`/api/escrow/product/${productId}/released`] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/get"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Failed",
        description: error.message || "Insufficient balance or transaction error",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ReviewForm) => {
    reviewMutation.mutate(data);
  };

  const handleRatingChange = (rating: number) => {
    setSelectedRating(rating);
    form.setValue("rating", rating);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container px-4 md:px-8 py-8">
          <div className="grid lg:grid-cols-2 gap-8">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container px-4 md:px-8 py-8">
          <div className="text-center py-16">
            <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Product not found</h2>
            <p className="text-muted-foreground mb-4">This product may have been removed or doesn't exist.</p>
            <Link href="/">
              <Button data-testid="button-back-home">Back to Home</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const mainReviews = product.reviews?.filter((r) => !r.parentReviewId && r.rating) || [];
  const comments = product.reviews?.filter((r) => !r.rating) || [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Products
          </Button>
        </Link>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          <div className="space-y-3">
            <div 
              className="aspect-square w-full overflow-hidden rounded-lg bg-black flex items-center justify-center cursor-pointer"
              onClick={() => {
                if (product.imageData || (product.images && product.images.length > 0)) {
                  setShowImageViewer(true);
                }
              }}
              data-testid="button-view-image"
            >
              {(() => {
                const allImages = [
                  ...(product.imageData ? [product.imageData] : []),
                  ...(product.images?.filter(img => img !== product.imageData) || [])
                ];
                const currentImage = allImages[selectedImageIndex] || product.imageData;
                
                if (currentImage) {
                  return (
                    <img
                      src={currentImage}
                      alt={product.name}
                      className="h-full w-full object-contain"
                      data-testid="img-product-detail"
                    />
                  );
                }
                return <Package className="h-24 w-24 text-muted-foreground/40" />;
              })()}
            </div>
            
            {(() => {
              const allImages = [
                ...(product.imageData ? [product.imageData] : []),
                ...(product.images?.filter(img => img !== product.imageData) || [])
              ];
              
              if (allImages.length > 1) {
                return (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {allImages.map((img, index) => (
                      <div
                        key={index}
                        className={`h-16 w-16 flex-shrink-0 rounded-md overflow-hidden cursor-pointer border-2 bg-black ${
                          selectedImageIndex === index ? "border-primary" : "border-transparent"
                        }`}
                        onClick={() => setSelectedImageIndex(index)}
                        data-testid={`button-thumbnail-${index}`}
                      >
                        <img
                          src={img}
                          alt={`${product.name} - ${index + 1}`}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            })()}
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-product-name">
                  {product.name}
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => favoriteMutation.mutate()}
                  disabled={favoriteMutation.isPending}
                  className={product.isFavorite ? "text-red-500" : ""}
                  data-testid="button-favorite"
                >
                  <Heart className={`h-6 w-6 ${product.isFavorite ? "fill-current" : ""}`} />
                </Button>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <StarRating rating={Math.round(product.averageRating || 0)} />
                <span className="text-muted-foreground">
                  ({product.reviewCount || 0} reviews)
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span>{product.viewCount || 0} views</span>
              </div>
            </div>

            <p className="text-3xl font-bold text-primary" data-testid="text-product-price">
              ${Number(product.price).toFixed(2)}
            </p>

<div className="space-y-2">
  <p 
    className="text-muted-foreground leading-relaxed whitespace-pre-wrap" 
    data-testid="text-product-description"
    style={{ wordBreak: 'break-word' }}
  >
    {showFullDescription 
      ? product.description 
      : product.description.length > 300 
        ? `${product.description.slice(0, 300)}...` 
        : product.description
    }
  </p>
  {product.description.length > 300 && (
    <Button 
      variant="link" 
      className="px-0 h-auto text-primary"
      onClick={() => setShowFullDescription(!showFullDescription)}
    >
      {showFullDescription ? 'Show less' : 'Read more'}
    </Button>
  )}
</div>

            {product.merchant && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-4">
                    <Avatar
                      className="h-12 w-12 cursor-pointer"
                      onClick={() => setLocation(`/user/${product.merchant?.id}`)}
                    >
                      {product.merchant.avatarData ? (
                        <AvatarImage src={product.merchant.avatarData} alt={product.merchant.username} />
                      ) : null}
                      <AvatarFallback>{product.merchant.username.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold cursor-pointer hover:underline"
                          onClick={() => setLocation(`/user/${product.merchant?.id}`)}
                        >
                          {product.merchant.username}
                        </span>
                        <Badge variant="secondary">
                          <Store className="h-3 w-3 mr-1" />
                          Merchant
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{product.merchant.followerCount} followers</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={product.merchant.isFollowing ? "outline" : "default"}
                        size="sm"
                        onClick={() => followMutation.mutate()}
                        disabled={followMutation.isPending}
                        data-testid="button-follow-merchant"
                      >
                        {product.merchant.isFollowing ? "Following" : "Follow"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startConversationMutation.mutate()}
                        disabled={startConversationMutation.isPending}
                        data-testid="button-message-merchant"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Purchased Section - Show if user has completed purchase (escrow or released status) */}
            {purchaseStatus?.hasPurchased && (
              <div className="space-y-3">
                <Button 
                  variant="secondary" 
                  className="w-full"
                  onClick={() => setLocation("/escrow")}
                  data-testid="button-purchased"
                >
                  <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                  Purchased - View in Escrow
                </Button>
                
                {/* Show snapshot details if available (for released orders) */}
                {purchaseStatus.snapshot && (purchaseStatus.snapshot.afterBuyMessage || purchaseStatus.snapshot.afterBuyButtonUrl) && (
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      {purchaseStatus.snapshot.afterBuyMessage && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Message from seller:</p>
                          <p className="text-sm whitespace-pre-wrap" data-testid="text-after-buy-message">
                            {purchaseStatus.snapshot.afterBuyMessage}
                          </p>
                        </div>
                      )}
                      {purchaseStatus.snapshot.afterBuyButtonUrl && (
                        <Button 
                          asChild
                          className="w-full"
                          data-testid="button-after-buy-cta"
                        >
                          <a 
                            href={purchaseStatus.snapshot.afterBuyButtonUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {purchaseStatus.snapshot.afterBuyButtonLabel || "Access Product"}
                          </a>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {user && product.merchant && user.id === product.merchant.id ? (
              <div className="p-3 bg-muted rounded-md text-muted-foreground text-sm">
                You cannot purchase your own product.
              </div>
            ) : !purchaseStatus?.hasPurchased && (
              <div className="space-y-4">
                {feeSettings && feeSettings.globalFeePercent > 0 && (
                  <div className="p-3 rounded-md bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">You pay</span>
                      <span className="font-medium" data-testid="text-buyer-pays">${Number(product.price).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Seller receives ({100 - feeSettings.globalFeePercent}%)</span>
                      <span className="text-muted-foreground" data-testid="text-seller-receives">
                        ${(Number(product.price) * (1 - feeSettings.globalFeePercent / 100)).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">A {feeSettings.globalFeePercent}% platform fee applies to all purchases</p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Pay with</Label>
                  <Tabs value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "wallet" | "manual")} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="wallet" className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-green-500" />
                        Wallet
                      </TabsTrigger>
                      <TabsTrigger value="manual" className="flex items-center gap-2">
                        <Bitcoin className="h-4 w-4 text-orange-500" />
                        Manual
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {paymentMethod === "wallet" && (
                  <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Available Balance</span>
                      <span className="font-bold">{walletBalance.toFixed(6)} USDT</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {walletBalance >= Number(product?.price) 
                        ? "You have sufficient balance to complete this purchase"
                        : `You need ${(Number(product?.price) - walletBalance).toFixed(6)} more USDT`}
                    </p>
                  </div>
                )}

                {paymentMethod === "manual" && paymentCoins.length > 1 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Choose Cryptocurrency</Label>
                    <Tabs value={selectedCoin} onValueChange={setSelectedCoin} className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        {paymentCoins.map((coin) => (
                          <TabsTrigger 
                            key={coin.symbol} 
                            value={coin.symbol}
                            className="flex items-center gap-2"
                            data-testid={`tab-coin-${coin.symbol.toLowerCase()}`}
                          >
                            {coin.symbol === "BTC" ? (
                              <Bitcoin className="h-4 w-4 text-orange-500" />
                            ) : (
                              <SiBinance className="h-4 w-4 text-yellow-500" />
                            )}
                            {coin.symbol}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                )}
                
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => buyMutation.mutate()}
                  disabled={buyMutation.isPending}
                  data-testid="button-buy-now"
                >
                  {buyMutation.isPending ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-5 w-5 mr-2" />
                  )}
                  Buy Now {paymentCoins.length > 1 ? `with ${selectedCoin}` : ""}
                </Button>
              </div>
            )}
          </div>
        </div>

        <Separator className="my-8" />

        <section className="space-y-8">
          <h2 className="text-2xl font-bold" data-testid="text-reviews-title">
            Reviews & Comments
          </h2>

          {user && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leave a Review or Comment</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="rating"
                      render={() => (
                        <FormItem>
                          <FormLabel>Your Rating (only verified buyers can rate)</FormLabel>
                          <FormControl>
                            <StarRating
                              rating={selectedRating}
                              size="lg"
                              interactive
                              onRatingChange={handleRatingChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="comment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Comment</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Share your thoughts about this product..."
                              className="resize-none min-h-[100px]"
                              data-testid="input-review-comment"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={reviewMutation.isPending}
                      data-testid="button-submit-review"
                    >
                      {reviewMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        "Submit"
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {!user && (
            <Card>
              <CardContent className="py-8 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  Sign in to leave a review or comment
                </p>
                <Link href="/login">
                  <Button data-testid="button-login-to-review">Sign In</Button>
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {product.reviews && product.reviews.length > 0 ? (
              product.reviews.map((review) => (
                <Card key={review.id} data-testid={`card-review-${review.id}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Avatar>
                        <AvatarFallback>
                          {review.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold" data-testid={`text-review-username-${review.id}`}>
                              {review.username}
                            </p>
                            {review.isVerifiedBuyer && (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                Verified Buyer
                              </Badge>
                            )}
                            {review.isMerchantReply && (
                              <Badge variant="secondary">
                                <Store className="h-3 w-3 mr-1" />
                                Merchant
                              </Badge>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {review.rating && <StarRating rating={review.rating} size="sm" />}
                            {user && user.id === review.userId && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  data-testid={`button-edit-review-${review.id}`}
                                  onClick={() => {
                                    setEditingReviewId(review.id);
                                    setEditingComment(review.comment);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  data-testid={`button-delete-review-${review.id}`}
                                  onClick={() => deleteReviewMutation.mutate(review.id)}
                                  disabled={deleteReviewMutation.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        {editingReviewId === review.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editingComment}
                              onChange={(e) => setEditingComment(e.target.value)}
                              className="min-h-[80px]"
                              data-testid={`input-edit-review-${review.id}`}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                data-testid={`button-save-review-${review.id}`}
                                disabled={editReviewMutation.isPending || editingComment.length < 3}
                                onClick={() => editReviewMutation.mutate({ reviewId: review.id, comment: editingComment })}
                              >
                                {editReviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-cancel-edit-review-${review.id}`}
                                onClick={() => { setEditingReviewId(null); setEditingComment(""); }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-muted-foreground" data-testid={`text-review-comment-${review.id}`}>
                            {review.comment}
                            {review.isEdited && (
                              <span className="ml-2 text-xs text-muted-foreground/60 italic">(edited)</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">
                    No reviews yet. Be the first to review this product!
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </main>

      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {escrowOrder?.coinSymbol === "BNB" ? (
                <SiBinance className="h-5 w-5 text-yellow-500" />
              ) : escrowOrder?.coinSymbol === "USDT" ? (
                <Coins className="h-5 w-5 text-green-500" />
              ) : (
                <Bitcoin className="h-5 w-5 text-orange-500" />
              )}
              {escrowOrder?.status === "pending_payment" ? "Complete Your Payment" : "Payment Status"}
            </DialogTitle>
            <DialogDescription>
              {escrowOrder?.status === "pending_payment" 
                ? `Send ${escrowOrder?.coinSymbol || "crypto"} to the address below to complete your purchase. Your payment will be held in escrow for 24 hours.`
                : "Your payment has been received and is now in escrow protection."
              }
            </DialogDescription>
          </DialogHeader>

          {escrowOrder && (
            <div className="space-y-4">
              {feeSettings && feeSettings.globalFeePercent > 0 && (
                <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">You pay</span>
                    <span className="font-medium">${parseFloat(escrowOrder.usdAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Platform fee ({feeSettings.globalFeePercent}%)</span>
                    <span className="text-amber-700 dark:text-amber-300 font-medium">-${(parseFloat(escrowOrder.usdAmount) * (feeSettings.globalFeePercent / 100)).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-amber-200 dark:border-amber-800 pt-2 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">Merchant receives</span>
                    <span className="font-bold text-green-700 dark:text-green-300">${(parseFloat(escrowOrder.usdAmount) * (1 - feeSettings.globalFeePercent / 100)).toFixed(2)}</span>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Amount ({escrowOrder.coinSymbol})</p>
                  <p className="font-mono font-bold text-lg" data-testid="text-payment-crypto">
                    {(escrowOrder.cryptoAmount || escrowOrder.btcAmount).toFixed(escrowOrder.coinSymbol === "BNB" ? 6 : 8)} {escrowOrder.coinSymbol}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount (USD)</p>
                  <p className="font-bold text-lg" data-testid="text-payment-usd">${parseFloat(escrowOrder.usdAmount).toFixed(2)}</p>
                </div>
              </div>

              {escrowOrder.status === "pending_payment" && (
                <>
                  {paymentMethod === "wallet" && escrowOrder.coinSymbol === "USDT" ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Available Balance</span>
                          <span className="text-sm font-bold">{walletBalance.toFixed(6)} USDT</span>
                        </div>
                        <p className="text-sm font-medium">Price: {escrowOrder.cryptoAmount.toFixed(6)} USDT</p>
                      </div>
                      
                      <Button
                        className="w-full"
                        onClick={() => walletPaymentMutation.mutate()}
                        disabled={walletPaymentMutation.isPending || walletBalance < escrowOrder.cryptoAmount}
                        data-testid="button-pay-with-wallet"
                      >
                        {walletPaymentMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Coins className="mr-2 h-4 w-4" />
                            Pay with Wallet ({walletBalance.toFixed(6)} USDT)
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-center p-4 bg-white rounded-lg">
                        <QRCode 
                          value={escrowOrder.coinSymbol === "BTC" 
                            ? `bitcoin:${escrowOrder.depositAddress}?amount=${escrowOrder.cryptoAmount || escrowOrder.btcAmount}`
                            : escrowOrder.depositAddress}
                          size={180}
                          data-testid="qr-payment"
                        />
                      </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-sm">Deposit Address ({escrowOrder.coinSymbol === "BTC" ? "Bitcoin" : escrowOrder.coinSymbol === "BNB" ? "BNB Smart Chain" : "USDT BEP20"})</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 bg-muted rounded-md text-xs break-all font-mono" data-testid="text-deposit-address">
                        {escrowOrder.depositAddress}
                      </code>
                      <Button size="icon" variant="outline" onClick={copyAddress} data-testid="button-copy-address">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="buyerWallet" className="text-muted-foreground text-sm">
                      Your {escrowOrder.coinSymbol === "BTC" ? "Bitcoin" : escrowOrder.coinSymbol === "BNB" ? "BNB" : "USDT BEP20"} Wallet Address (required)
                    </Label>
                    <Input
                      id="buyerWallet"
                      placeholder={escrowOrder.coinSymbol === "BTC" ? "bc1q... or 1... or 3..." : "0x..."}
                      value={buyerRefundAddress}
                      onChange={(e) => setBuyerRefundAddress(e.target.value)}
                      data-testid="input-buyer-refund-address"
                    />
                    <p className="text-xs text-muted-foreground">
                      {escrowOrder.coinSymbol === "USDT" ? "Enter your BSC wallet address you sent USDT from." : "Enter the wallet address you sent payment from."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="txHash" className="text-muted-foreground text-sm">
                      Transaction Hash (required)
                    </Label>
                    <Input
                      id="txHash"
                      placeholder={escrowOrder.coinSymbol === "BTC" ? "Enter TX hash..." : "0x..."}
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      data-testid="input-tx-hash"
                    />
                    <p className="text-xs text-muted-foreground">
                      {escrowOrder.coinSymbol === "USDT" ? "Enter the BSC transaction hash after sending USDT." : "Enter the transaction hash after sending payment."}
                    </p>
                  </div>

                      <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md flex items-start gap-2">
                        <Shield className="h-4 w-4 text-blue-500 mt-0.5" />
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Your payment will be held in escrow for 24 hours. If you don't receive your product, you can raise a dispute.
                        </p>
                      </div>

                      <Button
                        className="w-full"
                        onClick={() => verifyPaymentMutation.mutate()}
                        disabled={verifyPaymentMutation.isPending || !buyerRefundAddress.trim() || !txHash.trim()}
                        data-testid="button-confirm-payment"
                      >
                        {verifyPaymentMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Verifying Payment...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Confirm Payment
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </>
              )}

              {escrowOrder.status === "escrow" && escrowOrder.escrowExpiresAt && (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-md text-center">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                    <p className="font-medium text-green-700 dark:text-green-300">Payment Received!</p>
                    <p className="text-sm text-green-600 dark:text-green-400">Your funds are now protected in escrow</p>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-md bg-orange-50 dark:bg-orange-950">
                    <span className="text-sm font-medium">Escrow expires in:</span>
                    <CountdownTimer expiresAt={escrowOrder.escrowExpiresAt} />
                  </div>

                  <div className="p-3 bg-muted rounded-md flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p>After 24 hours, funds will be released to the merchant automatically.</p>
                      <p className="mt-1">If you don't receive your product, go to <strong>My Escrow Orders</strong> to raise a dispute.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowPaymentModal(false)}
              data-testid="button-close-payment"
            >
              Close
            </Button>
            {escrowOrder?.status === "escrow" && (
              <Button 
                onClick={() => setLocation("/escrow")}
                data-testid="button-view-escrow"
              >
                View My Escrow Orders
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImageViewer} onOpenChange={(open) => { setShowImageViewer(open); if (!open) setZoomLevel(1); }}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
          <div className="relative w-full h-[90vh] flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
              onClick={() => { setShowImageViewer(false); setZoomLevel(1); }}
              data-testid="button-close-image-viewer"
            >
              <X className="h-6 w-6" />
            </Button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="h-5 w-5" />
              </Button>
              <span className="text-white text-sm min-w-[60px] text-center">{Math.round(zoomLevel * 100)}%</span>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="h-5 w-5" />
              </Button>
            </div>

            {(() => {
              const allImages = [
                ...(product.imageData ? [product.imageData] : []),
                ...(product.images?.filter(img => img !== product.imageData) || [])
              ];

              if (allImages.length > 1) {
                return (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-4 text-white hover:bg-white/20 z-50"
                      onClick={() => setSelectedImageIndex(prev => (prev - 1 + allImages.length) % allImages.length)}
                      data-testid="button-prev-image"
                    >
                      <ChevronLeft className="h-8 w-8" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-4 text-white hover:bg-white/20 z-50"
                      onClick={() => setSelectedImageIndex(prev => (prev + 1) % allImages.length)}
                      data-testid="button-next-image"
                    >
                      <ChevronRight className="h-8 w-8" />
                    </Button>
                  </>
                );
              }
              return null;
            })()}

            <div className="overflow-auto w-full h-full flex items-center justify-center">
              {(() => {
                const allImages = [
                  ...(product.imageData ? [product.imageData] : []),
                  ...(product.images?.filter(img => img !== product.imageData) || [])
                ];
                const currentImage = allImages[selectedImageIndex] || product.imageData;

                if (currentImage) {
                  return (
                    <img
                      src={currentImage}
                      alt={product.name}
                      className="max-w-none transition-transform duration-200"
                      style={{ transform: `scale(${zoomLevel})` }}
                      data-testid="img-fullscreen"
                    />
                  );
                }
                return null;
              })()}
            </div>

            {(() => {
              const allImages = [
                ...(product.imageData ? [product.imageData] : []),
                ...(product.images?.filter(img => img !== product.imageData) || [])
              ];

              if (allImages.length > 1) {
                return (
                  <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2">
                    {allImages.map((_, index) => (
                      <button
                        key={index}
                        className={`w-2 h-2 rounded-full ${selectedImageIndex === index ? "bg-white" : "bg-white/40"}`}
                        onClick={() => setSelectedImageIndex(index)}
                        data-testid={`button-dot-${index}`}
                      />
                    ))}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
