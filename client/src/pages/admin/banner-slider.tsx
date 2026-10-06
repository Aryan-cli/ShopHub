import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  Pin,
  EyeOff,
  Trash2,
  RefreshCw,
  Clock,
  Package,
  Save,
  Plus,
  Loader2,
  Search,
} from "lucide-react";

interface SliderSettings {
  id: string;
  refreshIntervalHours: number;
  lastRefreshedAt: string;
  updatedAt: string;
}

interface SliderItem {
  id: string;
  productId: string;
  isPinned: boolean;
  isExcluded: boolean;
  sortOrder: number;
  addedAt: string;
  product: {
    id: string;
    name: string;
    price: string;
    imageData: string | null;
    imageType: string | null;
    viewCount: number;
  } | null;
}

interface Product {
  id: string;
  name: string;
  price: string;
  imageData: string | null;
  imageType: string | null;
  viewCount: number;
}

export default function AdminBannerSlider() {
  const { toast } = useToast();
  const [intervalInput, setIntervalInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<"pin" | "exclude">("pin");

  const { data: settings, isLoading: settingsLoading } = useQuery<SliderSettings>({
    queryKey: ["/api/admin/banner-slider/settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/banner-slider/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setIntervalInput(String(data.refreshIntervalHours));
      return data;
    },
  });

  const { data: items, isLoading: itemsLoading } = useQuery<SliderItem[]>({
    queryKey: ["/api/admin/banner-slider/items"],
    queryFn: async () => {
      const res = await fetch("/api/admin/banner-slider/items", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: allProducts, isLoading: productsLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch("/api/products?limit=200", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: addDialogOpen,
  });

  const extractProductId = (query: string): string | null => {
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = query.match(uuidRegex);
    return match ? match[0] : null;
  };

  const extractedId = extractProductId(searchQuery);

  const { data: searchedById, isLoading: searchByIdLoading } = useQuery<Product>({
    queryKey: ["/api/products", extractedId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${extractedId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!extractedId && addDialogOpen,
    retry: false,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (refreshIntervalHours: number) => {
      return apiRequest("PATCH", "/api/admin/banner-slider/settings", { refreshIntervalHours });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banner-slider/settings"] });
      toast({ title: "Settings saved", description: "Refresh interval updated successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" }),
  });

  const forceRefreshMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/banner-slider/refresh", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banner-slider/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banner-slider"] });
      toast({ title: "Refreshed!", description: "Banner slider has been refreshed with latest trending products." });
    },
    onError: () => toast({ title: "Error", description: "Failed to refresh.", variant: "destructive" }),
  });

  const pinMutation = useMutation({
    mutationFn: async ({ productId, sortOrder }: { productId: string; sortOrder?: number }) => {
      return apiRequest("POST", "/api/admin/banner-slider/pin", { productId, sortOrder: sortOrder ?? 0 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banner-slider/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banner-slider"] });
      setAddDialogOpen(false);
      toast({ title: "Product pinned", description: "Product will always appear in the slider." });
    },
    onError: () => toast({ title: "Error", description: "Failed to pin product.", variant: "destructive" }),
  });

  const excludeMutation = useMutation({
    mutationFn: async (productId: string) => {
      return apiRequest("POST", "/api/admin/banner-slider/exclude", { productId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banner-slider/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banner-slider"] });
      setAddDialogOpen(false);
      toast({ title: "Product excluded", description: "Product won't appear in the slider." });
    },
    onError: () => toast({ title: "Error", description: "Failed to exclude product.", variant: "destructive" }),
  });

  const removeOverrideMutation = useMutation({
    mutationFn: async (productId: string) => {
      return apiRequest("DELETE", `/api/admin/banner-slider/items/${productId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banner-slider/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banner-slider"] });
      toast({ title: "Override removed", description: "Product will follow auto-trending logic." });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove override.", variant: "destructive" }),
  });

  const handleSaveInterval = () => {
    const val = parseInt(intervalInput);
    if (isNaN(val) || val < 1) {
      toast({ title: "Invalid value", description: "Please enter a valid number of hours (minimum 1).", variant: "destructive" });
      return;
    }
    updateSettingsMutation.mutate(val);
  };

  const pinnedItems = items?.filter(i => i.isPinned && !i.isExcluded) ?? [];
  const excludedItems = items?.filter(i => i.isExcluded) ?? [];

  const overrideProductIds = new Set(items?.map(i => i.productId) ?? []);

  const filteredProducts = (() => {
    const all = allProducts?.products ?? [];
    if (!searchQuery) return all;
    if (extractedId) {
      const byId = all.filter(p => p.id === extractedId);
      if (byId.length > 0) return byId;
      if (searchedById) return [searchedById];
      return [];
    }
    return all.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  })();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const nextRefreshTime = settings
    ? new Date(new Date(settings.lastRefreshedAt).getTime() + settings.refreshIntervalHours * 60 * 60 * 1000)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Banner Slider Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage the homepage banner slider. By default, it shows the top 10 trending products and auto-refreshes every 24 hours.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Auto-Refresh Settings
            </CardTitle>
            <CardDescription>Control how often the trending products refresh automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="refresh-interval">Refresh Interval (hours)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="refresh-interval"
                      type="number"
                      min={1}
                      value={intervalInput}
                      onChange={(e) => setIntervalInput(e.target.value)}
                      className="w-32"
                      data-testid="input-refresh-interval"
                    />
                    <Button
                      onClick={handleSaveInterval}
                      disabled={updateSettingsMutation.isPending}
                      data-testid="button-save-interval"
                    >
                      {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                  </div>
                </div>
                {settings && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Last refreshed: <span className="font-medium text-foreground">{formatDate(settings.lastRefreshedAt)}</span></p>
                    {nextRefreshTime && (
                      <p>Next auto-refresh: <span className="font-medium text-foreground">{formatDate(nextRefreshTime.toISOString())}</span></p>
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => forceRefreshMutation.mutate()}
                  disabled={forceRefreshMutation.isPending}
                  data-testid="button-force-refresh"
                >
                  {forceRefreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh Now
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Quick Stats
            </CardTitle>
            <CardDescription>Overview of your slider configuration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">Pinned products</span>
              <Badge variant="default">{pinnedItems.length}</Badge>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">Excluded products</span>
              <Badge variant="destructive">{excludedItems.length}</Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Auto-trending slots</span>
              <Badge variant="secondary">{Math.max(0, 10 - pinnedItems.length)}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Pin className="h-4 w-4 text-primary" />
                Pinned Products
              </CardTitle>
              <CardDescription>These products always appear in the slider regardless of trending status.</CardDescription>
            </div>
            <Dialog open={addDialogOpen && addMode === "pin"} onOpenChange={(o) => { setAddDialogOpen(o); setAddMode("pin"); }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { setAddMode("pin"); setAddDialogOpen(true); }} data-testid="button-add-pinned">
                  <Plus className="h-4 w-4 mr-1" /> Add Pinned
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Pin a Product</DialogTitle>
                  <DialogDescription>Choose a product to permanently pin in the slider.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, product ID, or paste URL..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                        data-testid="input-search-products"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground px-1">
                      Tip: Paste a product URL like <span className="font-mono">/product/abc-123...</span> or just the ID directly
                    </p>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {productsLoading || (extractedId && searchByIdLoading) ? (
                      <div className="text-center py-4 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                    ) : filteredProducts.length === 0 ? (
                      <p className="text-center py-4 text-muted-foreground text-sm">
                        {extractedId ? `No product found with ID: ${extractedId}` : "No products found."}
                      </p>
                    ) : (
                      filteredProducts.map((p) => {
                        const isAlreadyPinned = pinnedItems.some(i => i.productId === p.id);
                        return (
                          <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                            <div className="flex items-center gap-3">
                              {p.imageData ? (
                                <img src={p.imageData} alt={p.name} className="h-10 w-10 object-cover rounded" />
                              ) : (
                                <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-sm line-clamp-1">{p.name}</p>
                                <p className="text-xs text-muted-foreground">${Number(p.price).toFixed(2)}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant={isAlreadyPinned ? "outline" : "default"}
                              disabled={pinMutation.isPending}
                              onClick={() => pinMutation.mutate({ productId: p.id })}
                              data-testid={`button-pin-product-${p.id}`}
                            >
                              {isAlreadyPinned ? "Re-pin" : "Pin"}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {itemsLoading ? (
            <div className="text-center py-4 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : pinnedItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Pin className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No pinned products. The slider will show auto-trending products.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pinnedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`pinned-item-${item.productId}`}>
                  <div className="flex items-center gap-3">
                    {item.product?.imageData ? (
                      <img src={item.product.imageData} alt={item.product.name} className="h-10 w-10 object-cover rounded" />
                    ) : (
                      <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{item.product?.name ?? "Unknown Product"}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-xs">Pinned</Badge>
                        {item.product && <span className="text-xs text-muted-foreground">${Number(item.product.price).toFixed(2)}</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeOverrideMutation.mutate(item.productId)}
                    disabled={removeOverrideMutation.isPending}
                    data-testid={`button-remove-pinned-${item.productId}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <EyeOff className="h-4 w-4 text-destructive" />
                Excluded Products
              </CardTitle>
              <CardDescription>These products will never appear in the slider, even if trending.</CardDescription>
            </div>
            <Dialog open={addDialogOpen && addMode === "exclude"} onOpenChange={(o) => { setAddDialogOpen(o); setAddMode("exclude"); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="destructive" onClick={() => { setAddMode("exclude"); setAddDialogOpen(true); }} data-testid="button-add-excluded">
                  <Plus className="h-4 w-4 mr-1" /> Add Excluded
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Exclude a Product</DialogTitle>
                  <DialogDescription>Choose a product to exclude from the slider permanently.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, product ID, or paste URL..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                        data-testid="input-search-exclude-products"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground px-1">
                      Tip: Paste a product URL like <span className="font-mono">/product/abc-123...</span> or just the ID directly
                    </p>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {productsLoading || (extractedId && searchByIdLoading) ? (
                      <div className="text-center py-4 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                    ) : filteredProducts.length === 0 ? (
                      <p className="text-center py-4 text-muted-foreground text-sm">
                        {extractedId ? `No product found with ID: ${extractedId}` : "No products found."}
                      </p>
                    ) : (
                      filteredProducts.map((p) => {
                        const isAlreadyExcluded = excludedItems.some(i => i.productId === p.id);
                        return (
                          <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                            <div className="flex items-center gap-3">
                              {p.imageData ? (
                                <img src={p.imageData} alt={p.name} className="h-10 w-10 object-cover rounded" />
                              ) : (
                                <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-sm line-clamp-1">{p.name}</p>
                                <p className="text-xs text-muted-foreground">${Number(p.price).toFixed(2)}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={excludeMutation.isPending || isAlreadyExcluded}
                              onClick={() => excludeMutation.mutate(p.id)}
                              data-testid={`button-exclude-product-${p.id}`}
                            >
                              {isAlreadyExcluded ? "Excluded" : "Exclude"}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {itemsLoading ? (
            <div className="text-center py-4 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : excludedItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <EyeOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No excluded products. All trending products may appear in the slider.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {excludedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg border-destructive/20" data-testid={`excluded-item-${item.productId}`}>
                  <div className="flex items-center gap-3">
                    {item.product?.imageData ? (
                      <img src={item.product.imageData} alt={item.product.name} className="h-10 w-10 object-cover rounded" />
                    ) : (
                      <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{item.product?.name ?? "Unknown Product"}</p>
                      <Badge variant="destructive" className="text-xs">Excluded</Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeOverrideMutation.mutate(item.productId)}
                    disabled={removeOverrideMutation.isPending}
                    data-testid={`button-remove-excluded-${item.productId}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
