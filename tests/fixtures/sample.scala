package com.example.processing

import scala.io.Source
import scala.util.{Try, Success, Failure}

case class Config(
  name: String,
  value: Int = 42,
  enabled: Boolean = true
)

sealed trait Status
object Status {
  case object Active extends Status
  case object Inactive extends Status
  case object Pending extends Status
}

trait Processor {
  def process(input: String): Option[String]
  def getStatus: Status
}

class DataProcessor(config: Config) extends Processor {
  override def process(input: String): Option[String] = {
    Try(Source.fromFile(input).mkString) match {
      case Success(data) => Some(data.toUpperCase)
      case Failure(_) => None
    }
  }

  override def getStatus: Status = {
    if (config.enabled) Status.Active else Status.Inactive
  }
}

object DataProcessor {
  def create(name: String): DataProcessor = {
    new DataProcessor(Config(name = name))
  }
}

def helper(x: Int): Int = x * 2

import scala.collection.mutable

case class CacheEntry[T](
  key: String,
  value: T,
  expiresAt: Long,
  tags: List[String] = Nil
)

class LRUCache[T](capacity: Int, defaultTTL: Long = 60000L) {
  private val cache = mutable.LinkedHashMap.empty[String, CacheEntry[T]]
  private var hits: Long = 0
  private var misses: Long = 0

  def get(key: String): Option[T] = {
    cache.get(key) match {
      case Some(entry) =>
        if (System.currentTimeMillis() > entry.expiresAt) {
          cache.remove(key)
          misses += 1
          None
        } else {
          hits += 1
          cache.remove(key)
          cache.put(key, entry)
          Some(entry.value)
        }
      case None =>
        misses += 1
        None
    }
  }

  def set(key: String, value: T, ttl: Option[Long] = None, tags: List[String] = Nil): Unit = {
    if (cache.contains(key)) {
      cache.remove(key)
    } else if (cache.size >= capacity) {
      cache.headOption.foreach { case (oldest, _) => cache.remove(oldest) }
    }

    cache.put(key, CacheEntry(
      key = key,
      value = value,
      expiresAt = System.currentTimeMillis() + ttl.getOrElse(defaultTTL),
      tags = tags
    ))
  }

  def invalidateByTag(tag: String): Int = {
    val keysToRemove = cache.collect {
      case (key, entry) if entry.tags.contains(tag) => key
    }.toList

    keysToRemove.foreach(cache.remove)
    keysToRemove.size
  }

  def stats: Map[String, Any] = {
    val total = hits + misses
    Map(
      "hits" -> hits,
      "misses" -> misses,
      "size" -> cache.size,
      "hitRate" -> (if (total == 0) 0.0 else hits.toDouble / total)
    )
  }

  def clear(): Unit = {
    cache.clear()
    hits = 0
    misses = 0
  }
}

class EventBus(maxListeners: Int = 10) {
  private val handlers = mutable.Map.empty[String, mutable.ListBuffer[Any => Unit]]
  private val onceHandlers = mutable.Map.empty[String, mutable.ListBuffer[Any => Unit]]

  def on(event: String)(handler: Any => Unit): () => Unit = {
    val eventHandlers = handlers.getOrElseUpdate(event, mutable.ListBuffer.empty)
    if (eventHandlers.size >= maxListeners) {
      System.err.println(s"Warning: max listeners ($maxListeners) reached for event: $event")
    }
    eventHandlers += handler

    () => off(event)(handler)
  }

  def once(event: String)(handler: Any => Unit): Unit = {
    onceHandlers.getOrElseUpdate(event, mutable.ListBuffer.empty) += handler
  }

  def off(event: String)(handler: Any => Unit): Unit = {
    handlers.get(event).foreach(_ -= handler)
  }

  def emit(event: String, data: Any = null): Unit = {
    handlers.get(event).foreach(_.foreach(_(data)))
    onceHandlers.remove(event).foreach(_.foreach(_(data)))
  }

  def listenerCount(event: String): Int = {
    val regular = handlers.get(event).map(_.size).getOrElse(0)
    val once = onceHandlers.get(event).map(_.size).getOrElse(0)
    regular + once
  }

  def removeAllListeners(event: Option[String] = None): Unit = {
    event match {
      case Some(e) =>
        handlers.remove(e)
        onceHandlers.remove(e)
      case None =>
        handlers.clear()
        onceHandlers.clear()
    }
  }
}

def retryWithBackoff[T](
  maxRetries: Int = 3,
  baseDelay: Long = 1000L,
  maxDelay: Long = 30000L
)(operation: => T): T = {
  var lastError: Throwable = null
  val random = new scala.util.Random

  for (attempt <- 0 to maxRetries) {
    try {
      return operation
    } catch {
      case e: Throwable =>
        lastError = e
        if (attempt < maxRetries) {
          val delay = math.min(baseDelay * math.pow(2, attempt).toLong, maxDelay)
          val jitter = (delay * (0.5 + random.nextDouble() * 0.5)).toLong
          Thread.sleep(jitter)
        }
    }
  }

  throw lastError
}

def deepMerge(target: Map[String, Any], sources: Map[String, Any]*): Map[String, Any] = {
  sources.foldLeft(target) { (result, source) =>
    source.foldLeft(result) { case (acc, (key, value)) =>
      (acc.get(key), value) match {
        case (Some(targetMap: Map[String, Any] @unchecked), sourceMap: Map[String, Any] @unchecked) =>
          acc + (key -> deepMerge(targetMap, sourceMap))
        case _ =>
          acc + (key -> value)
      }
    }
  }
}
