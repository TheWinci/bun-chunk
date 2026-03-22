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
