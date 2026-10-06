import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Percent, Wallet, ArrowUpRight, Trash2, Plus, Bitcoin, Settings } from "lucide-react";
import { SiBinance } from "react-icons/si";
import { AdminLayout } from "./layout";

interface AdminWallet {
  id: string;
  btcBalance: number;
  bnbBalance: number;
  usdtBalance: number;
  totalBtcEarned: number;
  totalBnbEarned: number;
  totalUsdtEarned: number;
  btcWithdrawalAddress: string | null;
  bnbWithdrawalAddress: string | null;
  usdtWithdrawalAddress: string | null;
  autoTransferFees: boolean;
}

interface FeeSetting {
  globalFeePercent: number;
}

interface ProductFeeSetting {
  productId: string;
  feePercent: number;
}

interface ProductFee {
  id: string;
  productId: string;
  feePercent: number;
  createdAt: string;
  product?: {
    id: string;
    name: string;
    price: string;
  };
}

interface Product {
  id: string;
  name: string;
  price: string;
}

export default function AdminFees() {
  const { toast } = useToast();
  const [globalFeePercent, setGlobalFeePercent] = useState("");
  const [withdrawCoin, setWithdrawCoin] = useState("BTC");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawPassword, setWithdrawPassword] = useState("");
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showAddFeeDialog, setShowAddFeeDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productFeePercent, setProductFeePercent] = useState("");

  const { data: adminWallet = {} as AdminWallet, isLoading: walletLoading, error: walletError } = useQuery<AdminWallet>({
    queryKey: ["/api/admin/wallet"],
  });

  const { data: feeSettings = { globalFeePercent: 0 } as FeeSetting, error: feeError } = useQuery<FeeSetting>({
    queryKey: ["/api/fee-settings"],
  });

  const { data: productFees = [], isLoading: feesLoading, error: feesError } = useQuery<ProductFee[]>({
    queryKey: ["/api/admin/product-fees"],
  });

  const { data: products = [], error: productsError } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const updateGlobalFeeMutation = useMutation({
    mutationFn: async (feePercent: number) => {
      const response = await apiRequest("POST", "/api/admin/fee-settings", { feePercent });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Global fee updated successfully" });
      setGlobalFeePercent("");
      queryClient.invalidateQueries({ queryKey: ["/api/fee-settings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update fee", description: error.message, variant: "destructive" });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: { coinSymbol: string; amount: number; toAddress: string; password: string }) => {
      const response = await apiRequest("POST", "/api/admin/wallet/withdraw", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Withdrawal successful" });
      setShowWithdrawDialog(false);
      setWithdrawAmount("");
      setWithdrawAddress("");
      setWithdrawPassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallet"] });
    },
    onError: (error: Error) => {
      toast({ title: "Withdrawal failed", description: error.message, variant: "destructive" });
    },
  });

  const addProductFeeMutation = useMutation({
    mutationFn: async (data: { productId: string; feePercent: number }) => {
      const response = await apiRequest("POST", `/api/admin/product-fees/${data.productId}`, { feePercent: data.feePercent });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Product fee added successfully" });
      setShowAddFeeDialog(false);
      setSelectedProductId("");
      setProductFeePercent("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/product-fees"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add fee", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductFeeMutation = useMutation({
    mutationFn: async (productId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/product-fees/${productId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Product fee removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/product-fees"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove fee", description: error.message, variant: "destructive" });
    },
  });

  const handleUpdateGlobalFee = () => {
    const percent = parseFloat(globalFeePercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      toast({ title: "Invalid fee percentage", description: "Please enter a value between 0 and 100", variant: "destructive" });
      return;
    }
    updateGlobalFeeMutation.mutate(percent);
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    if (!withdrawAddress.trim()) {
      toast({ title: "Wallet address required", variant: "destructive" });
      return;
    }
    if (!withdrawPassword.trim()) {
      toast({ title: "Password required", variant: "destructive" });
      return;
    }
    withdrawMutation.mutate({
      coinSymbol: withdrawCoin,
      amount,
      toAddress: withdrawAddress.trim(),
      password: withdrawPassword,
    });
  };

  const handleAddProductFee = () => {
    const percent = parseFloat(productFeePercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      toast({ title: "Invalid fee percentage", variant: "destructive" });
      return;
    }
    if (!selectedProductId) {
      toast({ title: "Please select a product", variant: "destructive" });
      return;
    }
    addProductFeeMutation.mutate({ productId: selectedProductId, feePercent: percent });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-fees-title">Fee Management</h1>
          <p className="text-muted-foreground">Manage service fees and collected revenue</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">BTC Fee Collected</CardTitle>
              <Bitcoin className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              {walletLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : walletError ? (
                <div className="text-xs text-destructive">Error loading</div>
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-btc-collected">
                    {(adminWallet?.btcBalance || 0).toFixed(8)} BTC
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total earned: {(adminWallet?.totalBtcEarned || 0).toFixed(8)} BTC
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">BNB Fee Collected</CardTitle>
              <SiBinance className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {walletLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : walletError ? (
                <div className="text-xs text-destructive">Error loading</div>
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-bnb-collected">
                    {(adminWallet?.bnbBalance || 0).toFixed(6)} BNB
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total earned: {(adminWallet?.totalBnbEarned || 0).toFixed(6)} BNB
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">USDT Fee Collected</CardTitle>
              <Wallet className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {walletLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : walletError ? (
                <div className="text-xs text-destructive">Error loading</div>
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-usdt-collected">
                    {(adminWallet?.usdtBalance || 0).toFixed(6)} USDT
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total earned: {(adminWallet?.totalUsdtEarned || 0).toFixed(6)} USDT
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Global Fee Rate</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {feeError ? (
                <div className="text-xs text-destructive">Error loading</div>
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-global-fee">
                    {feeSettings?.globalFeePercent || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">Applied to all products</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Settings Section */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Fee Settings
              </CardTitle>
              <CardDescription>Configure global service fee percentage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="globalFee">Global Fee Percentage (%)</Label>
                <div className="flex gap-2">
                  <Input
                    id="globalFee"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder={String(feeSettings?.globalFeePercent || 0)}
                    value={globalFeePercent}
                    onChange={(e) => setGlobalFeePercent(e.target.value)}
                    data-testid="input-global-fee"
                  />
                  <Button
                    onClick={handleUpdateGlobalFee}
                    disabled={updateGlobalFeeMutation.isPending}
                    data-testid="button-update-fee"
                  >
                    {updateGlobalFeeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Update
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Withdraw Fees
              </CardTitle>
              <CardDescription>Withdraw collected fees to external wallet</CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
                <DialogTrigger asChild>
                  <Button className="w-full" data-testid="button-open-withdraw">
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Withdraw Fees
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Withdraw Fees</DialogTitle>
                    <DialogDescription>
                      Enter withdrawal password, amount and destination wallet address
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Coin</Label>
                      <Select value={withdrawCoin} onValueChange={setWithdrawCoin}>
                        <SelectTrigger data-testid="select-withdraw-coin">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BTC">BTC ({(adminWallet?.btcBalance || 0).toFixed(8)})</SelectItem>
                          <SelectItem value="BNB">BNB ({(adminWallet?.bnbBalance || 0).toFixed(6)})</SelectItem>
                          <SelectItem value="USDT">USDT ({(adminWallet?.usdtBalance || 0).toFixed(6)})</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="withdrawAmount">Amount</Label>
                      <Input
                        id="withdrawAmount"
                        type="number"
                        step="0.00000001"
                        placeholder="0.00000000"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        data-testid="input-withdraw-amount"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="withdrawAddress">Wallet Address</Label>
                      <Input
                        id="withdrawAddress"
                        placeholder="Enter destination wallet address"
                        value={withdrawAddress}
                        onChange={(e) => setWithdrawAddress(e.target.value)}
                        data-testid="input-withdraw-address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="withdrawPassword">Withdrawal Password</Label>
                      <Input
                        id="withdrawPassword"
                        type="password"
                        placeholder="Enter withdrawal password"
                        value={withdrawPassword}
                        onChange={(e) => setWithdrawPassword(e.target.value)}
                        data-testid="input-withdraw-password"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowWithdrawDialog(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleWithdraw}
                      disabled={withdrawMutation.isPending}
                      data-testid="button-confirm-withdraw"
                    >
                      {withdrawMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Withdraw
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>

        {/* Product Fees Section */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Product-Specific Fees</CardTitle>
              <CardDescription>Set extra fees for specific products</CardDescription>
            </div>
            <Dialog open={showAddFeeDialog} onOpenChange={setShowAddFeeDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-product-fee">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product Fee
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Product-Specific Fee</DialogTitle>
                  <DialogDescription>
                    Set an extra fee for a specific product (overrides global fee if higher)
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                      <SelectTrigger data-testid="select-product">
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products && products.length > 0 ? (
                          products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} (${product.price})
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">No products available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="productFee">Fee Percentage (%)</Label>
                    <Input
                      id="productFee"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="0"
                      value={productFeePercent}
                      onChange={(e) => setProductFeePercent(e.target.value)}
                      data-testid="input-product-fee"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddFeeDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddProductFee}
                    disabled={addProductFeeMutation.isPending}
                    data-testid="button-confirm-add-fee"
                  >
                    {addProductFeeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Fee
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {feesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : feesError ? (
              <div className="text-center py-8 text-destructive">
                <p>Failed to load product fees</p>
              </div>
            ) : productFees && productFees.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Fee %</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productFees.map((fee) => (
                    <TableRow key={fee.id}>
                      <TableCell className="font-medium">
                        {fee.product?.name || fee.productId}
                      </TableCell>
                      <TableCell>{fee.feePercent}%</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteProductFeeMutation.mutate(fee.productId)}
                          disabled={deleteProductFeeMutation.isPending}
                          data-testid={`button-delete-fee-${fee.productId}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No product-specific fees configured
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
