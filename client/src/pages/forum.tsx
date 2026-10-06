import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MessageSquare, Heart, Search, Plus, Loader2, TrendingUp, ImagePlus, Trash2, Trophy, Eye, Crown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ForumPost {
  id: string;
  content: string;
  imageData: string | null;
  imageType: string | null;
  likeCount: number;
  commentCount: number;
  viewCount?: number;
  createdAt: string;
  user: { id: string; username: string; avatarData: string | null; avatarType: string | null; isMerchant: boolean } | null;
  hasLiked: boolean;
}

export default function Forum() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("latest");

  const { data: posts, isLoading } = useQuery<ForumPost[]>({
    queryKey: ["/api/forum", activeTab === "trending" ? "?trending=true" : searchQuery ? `?search=${searchQuery}` : ""],
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: { content: string; imageData?: string; imageType?: string }) => {
      const response = await apiRequest("POST", "/api/forum", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Post created successfully" });
      setIsCreateDialogOpen(false);
      setNewPostContent("");
      setNewPostImage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/forum"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create post", description: error.message, variant: "destructive" });
    },
  });

  const likePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiRequest("POST", `/api/forum/${postId}/like`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum"] });
    },
    onError: () => {
      toast({ title: "Please login to like posts", variant: "destructive" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      await apiRequest("DELETE", `/api/forum/${postId}`);
    },
    onSuccess: () => {
      toast({ title: "Post deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/forum"] });
    },
    onError: () => {
      toast({ title: "Failed to delete post", variant: "destructive" });
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPostImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreatePost = () => {
    if (!newPostContent.trim()) {
      toast({ title: "Post content is required", variant: "destructive" });
      return;
    }
    createPostMutation.mutate({
      content: newPostContent,
      imageData: newPostImage || undefined,
      imageType: newPostImage ? "image/jpeg" : undefined,
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    queryClient.invalidateQueries({ queryKey: ["/api/forum"] });
  };

  // Get top 3 posts for ranking display
  const topPosts = posts ? [...posts].sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount)).slice(0, 3) : [];

  const getRankBadgeColor = (index: number) => {
    switch (index) {
      case 0: return "bg-yellow-500 dark:bg-yellow-600";
      case 1: return "bg-gray-400 dark:bg-gray-500";
      case 2: return "bg-amber-700 dark:bg-amber-800";
      default: return "bg-muted";
    }
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="h-4 w-4" />;
    return <Trophy className="h-4 w-4" />;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 max-w-3xl">
            <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
              <h1 className="text-3xl font-bold" data-testid="text-page-title">Forum</h1>
              
              {user && (
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-post">
                      <Plus className="h-4 w-4 mr-2" />
                      New Post
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Post</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        value={newPostContent}
                        onChange={(e) => setNewPostContent(e.target.value)}
                        placeholder="What's on your mind?"
                        className="resize-none min-h-[120px]"
                        data-testid="input-post-content"
                      />
                      {newPostImage && (
                        <div className="relative">
                          <img src={newPostImage} alt="Preview" className="max-h-48 rounded-md" />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2"
                            onClick={() => setNewPostImage(null)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <label className="cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground">
                          <ImagePlus className="h-5 w-5" />
                          <span>Add Image</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageChange}
                          />
                        </label>
                        <Button onClick={handleCreatePost} disabled={createPostMutation.isPending} data-testid="button-submit-post">
                          {createPostMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Posting...
                            </>
                          ) : (
                            "Post"
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <form onSubmit={handleSearch} className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search posts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-forum-search"
                />
              </div>
            </form>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList>
                <TabsTrigger value="latest" data-testid="tab-latest">Latest</TabsTrigger>
                <TabsTrigger value="trending" data-testid="tab-trending">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Trending
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : posts && posts.length > 0 ? (
              <div className="space-y-4">
                {posts.map((post) => (
                  <Card key={post.id} data-testid={`card-post-${post.id}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Avatar
                          className="cursor-pointer"
                          onClick={() => post.user && setLocation(`/user/${post.user.id}`)}
                        >
                          {post.user?.avatarData ? (
                            <AvatarImage src={post.user.avatarData} />
                          ) : null}
                          <AvatarFallback>{post.user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="font-semibold cursor-pointer hover:underline"
                              onClick={() => post.user && setLocation(`/user/${post.user.id}`)}
                            >
                              {post.user?.username}
                            </span>
                            {post.user?.isMerchant && <Badge variant="secondary">Merchant</Badge>}
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap">{post.content}</p>
                          {post.imageData && (
                            <img src={post.imageData} alt="Post image" className="mt-3 rounded-md max-h-96 object-contain" />
                          )}
                          <div className="flex items-center gap-4 mt-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => likePostMutation.mutate(post.id)}
                              className={post.hasLiked ? "text-red-500" : ""}
                              data-testid={`button-like-${post.id}`}
                            >
                              <Heart className={`h-4 w-4 mr-1 ${post.hasLiked ? "fill-current" : ""}`} />
                              {post.likeCount}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLocation(`/forum/${post.id}`)}
                              data-testid={`button-comments-${post.id}`}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              {post.commentCount}
                            </Button>
                            {(post.user?.id === user?.id || user?.isAdmin) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deletePostMutation.mutate(post.id)}
                                data-testid={`button-delete-post-${post.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold mb-2">No posts yet</h2>
                  <p className="text-muted-foreground mb-4">Be the first to share something!</p>
                  {user && (
                    <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-post">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Post
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar with rankings */}
          <div className="lg:w-80 space-y-6">
            {/* Top Posts Ranking */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Top Posts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : topPosts.length > 0 ? (
                  topPosts.map((post, index) => (
                    <div
                      key={post.id}
                      className="flex items-start gap-3 p-3 rounded-md bg-muted/50 cursor-pointer hover-elevate"
                      onClick={() => setLocation(`/forum/${post.id}`)}
                      data-testid={`ranking-post-${post.id}`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-white ${getRankBadgeColor(index)}`}>
                        {index === 0 ? (
                          <Crown className="h-4 w-4" />
                        ) : (
                          <span className="font-bold text-sm">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar className="h-5 w-5">
                            {post.user?.avatarData ? (
                              <AvatarImage src={post.user.avatarData} />
                            ) : null}
                            <AvatarFallback className="text-xs">{post.user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium truncate">{post.user?.username}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {post.likeCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {post.commentCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No posts yet</p>
                )}
              </CardContent>
            </Card>

            {/* Most Liked */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Heart className="h-5 w-5 text-red-500" />
                  Most Liked
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : posts && posts.length > 0 ? (
                  [...posts].sort((a, b) => b.likeCount - a.likeCount).slice(0, 5).map((post, index) => (
                    <div
                      key={post.id}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => setLocation(`/forum/${post.id}`)}
                    >
                      <span className="text-sm font-medium text-muted-foreground w-4">{index + 1}</span>
                      <Avatar className="h-6 w-6">
                        {post.user?.avatarData ? (
                          <AvatarImage src={post.user.avatarData} />
                        ) : null}
                        <AvatarFallback className="text-xs">{post.user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm truncate">{post.user?.username}</span>
                      <Badge variant="secondary" className="text-xs">
                        <Heart className="h-3 w-3 mr-1" />
                        {post.likeCount}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">No posts yet</p>
                )}
              </CardContent>
            </Card>

            {/* Most Discussed */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                  Most Discussed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : posts && posts.length > 0 ? (
                  [...posts].sort((a, b) => b.commentCount - a.commentCount).slice(0, 5).map((post, index) => (
                    <div
                      key={post.id}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => setLocation(`/forum/${post.id}`)}
                    >
                      <span className="text-sm font-medium text-muted-foreground w-4">{index + 1}</span>
                      <Avatar className="h-6 w-6">
                        {post.user?.avatarData ? (
                          <AvatarImage src={post.user.avatarData} />
                        ) : null}
                        <AvatarFallback className="text-xs">{post.user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm truncate">{post.user?.username}</span>
                      <Badge variant="secondary" className="text-xs">
                        <MessageSquare className="h-3 w-3 mr-1" />
                        {post.commentCount}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">No posts yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
