import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Eye } from "lucide-react";

interface SplashScreenData {
  id: string;
  htmlContent: string;
  isEnabled: boolean;
  displayDuration: number;
  useLoadingMode?: boolean;
  updatedAt: string;
}

export default function AdminSplashScreen() {
  const { toast } = useToast();
  const [htmlContent, setHtmlContent] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [displayDuration, setDisplayDuration] = useState(3000);
  const [useLoadingMode, setUseLoadingMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { data: splashData, isLoading } = useQuery({
    queryKey: ["/api/admin/splash-screen"],
    queryFn: async () => {
      const res = await fetch("/api/admin/splash-screen");
      if (!res.ok) throw new Error("Failed to fetch splash screen");
      return res.json() as Promise<SplashScreenData>;
    },
  });

  useEffect(() => {
    if (splashData) {
      setHtmlContent(splashData.htmlContent);
      setIsEnabled(splashData.isEnabled);
      setDisplayDuration(splashData.displayDuration);
      setUseLoadingMode(splashData.useLoadingMode || false);
    }
  }, [splashData]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/splash-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlContent,
          isEnabled,
          displayDuration,
          useLoadingMode,
        }),
      });
      if (!res.ok) throw new Error("Failed to update splash screen");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Splash screen updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update splash screen",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Splash Screen</h1>
        <p className="text-muted-foreground">Customize your website's splash screen</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Customize Splash Screen</CardTitle>
            <CardDescription>Enter HTML code that will be displayed when users visit your website</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="html">HTML Content</Label>
              <Textarea
                id="html"
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                placeholder="Enter your HTML code here..."
                className="font-mono text-sm h-64"
              />
              <p className="text-xs text-muted-foreground">
                You can use HTML, CSS, and JavaScript. Example: &lt;div style="text-align: center; padding: 50px;"&gt;&lt;h1&gt;Welcome!&lt;/h1&gt;&lt;/div&gt;
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Display Duration (ms)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={displayDuration}
                    onChange={(e) => setDisplayDuration(parseInt(e.target.value) || 3000)}
                    min="500"
                    max="30000"
                    step="500"
                    disabled={useLoadingMode}
                  />
                  <p className="text-xs text-muted-foreground">
                    {useLoadingMode ? "Duration ignored in loading mode" : "How long to show the splash (500-30000ms)"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={isEnabled}
                      onChange={(e) => setIsEnabled(e.target.checked)}
                      className="rounded border"
                    />
                    <label htmlFor="enabled" className="text-sm cursor-pointer">
                      {isEnabled ? "Enabled" : "Disabled"}
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="space-y-2">
                  <Label className="font-semibold">Loading System</Label>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded border border-blue-200">
                    <input
                      type="checkbox"
                      id="loadingMode"
                      checked={useLoadingMode}
                      onChange={(e) => setUseLoadingMode(e.target.checked)}
                      className="rounded border"
                    />
                    <div className="flex-1">
                      <label htmlFor="loadingMode" className="text-sm font-medium cursor-pointer">
                        Enable Loading Mode
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        When enabled, splash screen shows first and automatically disappears when website is fully loaded
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                {showPreview ? "Hide" : "Preview"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {showPreview && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Live preview of your splash screen</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-black rounded border border-border overflow-hidden">
                <div
                  className="w-full h-96 bg-white flex items-center justify-center overflow-auto"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
