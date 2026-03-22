package com.example.processing

import java.io.File
import java.nio.file.Path

data class Config(
    val name: String,
    val value: Int = 42,
    val enabled: Boolean = true
)

enum class Status {
    ACTIVE, INACTIVE, PENDING
}

interface Processor {
    fun process(input: String): String?
    fun getStatus(): Status
}

class DataProcessor(private val config: Config) : Processor {
    override fun process(input: String): String? {
        return try {
            File(input).readText().uppercase()
        } catch (e: Exception) {
            null
        }
    }

    override fun getStatus(): Status {
        return if (config.enabled) Status.ACTIVE else Status.INACTIVE
    }
}

fun createProcessor(name: String): DataProcessor {
    val config = Config(name = name)
    return DataProcessor(config)
}

fun helper(x: Int): Int = x * 2
