import React from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import type { Article } from '../types/api';
import * as Sentry from '@sentry/react-native';
import { TimeToFullDisplay } from '../utils';

interface ArticleCardProps {
  article: Article;
}

export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <View>
      <TimeToFullDisplay record={true} />
      <Sentry.Profiler name="ArticleCard">
        <Pressable style={styles.card}>
          <Image source={{ uri: article.image_url }} style={styles.image} />
          <View style={styles.content}>
            <Text style={styles.source}>{article.news_site}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {article.title}
            </Text>
            <Text style={styles.summary} numberOfLines={3}>
              {article.summary}
            </Text>
            <Text style={styles.date}>
              {new Date(article.published_at).toLocaleDateString()}
            </Text>
          </View>
        </Pressable>
      </Sentry.Profiler>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  image: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  content: {
    padding: 16,
  },
  source: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  summary: {
    fontSize: 16,
    color: '#444',
    lineHeight: 22,
    marginBottom: 12,
  },
  date: {
    fontSize: 14,
    color: '#666',
  },
});
