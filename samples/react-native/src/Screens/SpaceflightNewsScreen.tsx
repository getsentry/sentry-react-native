/* eslint-disable react/no-unstable-nested-components */
import React, { useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet, RefreshControl, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ArticleCard } from '../components/ArticleCard';
import type { Article } from '../types/api';
import { useFocusEffect } from '@react-navigation/native';

const ITEMS_PER_PAGE = 2; // Small limit to create more spans
const AUTO_LOAD_LIMIT = 1; // One auto load at the end of the list then shows button
const API_URL = 'https://api.spaceflightnewsapi.net/v4/articles';

export const preloadArticles = async () => {
  // Not actually preloading, just fetching for testing purposes
  await fetch(`${API_URL}/?limit=${ITEMS_PER_PAGE}`);
};

export default function NewsScreen() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadCount, setAutoLoadCount] = useState(0);

  const fetchArticles = async (pageNumber: number, refresh = false) => {
    try {
      const response = await fetch(
        `${API_URL}/?limit=${ITEMS_PER_PAGE}&offset=${
          (pageNumber - 1) * ITEMS_PER_PAGE
        }`,
      );
      const data = await response.json();

      const newArticles = data.results;
      setHasMore(data.next !== null);

      if (refresh) {
        setArticles(newArticles);
        setAutoLoadCount(0);
      } else {
        setArticles(prev => [...prev, ...newArticles]);
      }
    } catch (error) {
      console.error('Error fetching articles:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (articles.length) {
        console.log('Articles are already loaded');
        return;
      }

      fetchArticles(1, true);
    }, [articles]),
  );

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
      fetchArticles(page + 1);
      setAutoLoadCount(prev => prev + 1);
    }
  };

  const handleManualLoadMore = () => {
    handleLoadMore();
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchArticles(1, true);
  };

  const handleEndReached = () => {
    if (autoLoadCount < AUTO_LOAD_LIMIT) {
      handleLoadMore();
    }
  };

  const LoadMoreButton = () => {
    if (!hasMore) {
      return null;
    }
    if (loading) {
      return (
        <View style={styles.loadMoreContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      );
    }
    return (
      <Pressable
        style={({ pressed }) => [
          styles.loadMoreButton,
          pressed && styles.loadMoreButtonPressed,
        ]}
        onPress={handleManualLoadMore}>
        <Text style={styles.loadMoreText}>Load More Articles</Text>
      </Pressable>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={articles}
        renderItem={({ item }) => <ArticleCard article={item} />}
        estimatedItemSize={350}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          autoLoadCount >= AUTO_LOAD_LIMIT ? LoadMoreButton : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMoreContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadMoreButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 20,
    marginHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  loadMoreButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  loadMoreText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
