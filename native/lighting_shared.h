#ifndef CRAFTVALE_LIGHTING_SHARED_H
#define CRAFTVALE_LIGHTING_SHARED_H

#include <stdint.h>
#include <stdlib.h>

#define CHUNK_SIZE 16
#define CHUNK_HEIGHT 256
#define CHUNK_VOLUME (CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE)
#define LIGHT_LEVEL_MAX 15
#define AIR_BLOCK_ID 0

typedef struct {
  int dx;
  int dy;
  int dz;
} LightDirection;

typedef struct {
  uint32_t *data;
  uint32_t length;
  uint32_t capacity;
} IndexQueue;

static const LightDirection LIGHT_DIRECTIONS[] = {
    {1, 0, 0},
    {-1, 0, 0},
    {0, 1, 0},
    {0, -1, 0},
    {0, 0, 1},
    {0, 0, -1},
};

static inline int lighting_local_index(int local_x, int local_y, int local_z) {
  return local_x + CHUNK_SIZE * (local_z + CHUNK_SIZE * local_y);
}

static inline void lighting_local_position(int index, int *x, int *y, int *z) {
  const int plane = CHUNK_SIZE * CHUNK_SIZE;
  *y = index / plane;
  const int within_plane = index - (*y * plane);
  *z = within_plane / CHUNK_SIZE;
  *x = within_plane - (*z * CHUNK_SIZE);
}

static inline int lighting_init_queue(IndexQueue *queue, uint32_t initial_capacity) {
  queue->data = (uint32_t *)malloc(initial_capacity * sizeof(uint32_t));
  if (queue->data == NULL) {
    queue->length = 0;
    queue->capacity = 0;
    return 0;
  }

  queue->length = 0;
  queue->capacity = initial_capacity;
  return 1;
}

static inline void lighting_free_queue(IndexQueue *queue) {
  free(queue->data);
  queue->data = NULL;
  queue->length = 0;
  queue->capacity = 0;
}

static inline int lighting_queue_push(IndexQueue *queue, uint32_t value) {
  if (queue->length >= queue->capacity) {
    const uint32_t new_capacity = queue->capacity < 1024 ? 1024 : queue->capacity * 2;
    uint32_t *resized = (uint32_t *)realloc(queue->data, new_capacity * sizeof(uint32_t));
    if (resized == NULL) {
      return 0;
    }

    queue->data = resized;
    queue->capacity = new_capacity;
  }

  queue->data[queue->length++] = value;
  return 1;
}

static inline int lighting_propagate_sky_light_within_chunk(
    const uint8_t *passable, uint8_t *channel, IndexQueue *queue) {
  uint32_t queue_index = 0;
  while (queue_index < queue->length) {
    const uint32_t index = queue->data[queue_index++];
    const uint8_t light_level = channel[index];
    if (light_level == 0) {
      continue;
    }

    int x = 0;
    int y = 0;
    int z = 0;
    lighting_local_position((int)index, &x, &y, &z);
    for (size_t direction_index = 0;
         direction_index < sizeof(LIGHT_DIRECTIONS) / sizeof(LIGHT_DIRECTIONS[0]);
         direction_index += 1) {
      const LightDirection direction = LIGHT_DIRECTIONS[direction_index];
      const int next_x = x + direction.dx;
      const int next_y = y + direction.dy;
      const int next_z = z + direction.dz;
      if (next_x < 0 || next_x >= CHUNK_SIZE || next_y < 0 || next_y >= CHUNK_HEIGHT ||
          next_z < 0 || next_z >= CHUNK_SIZE) {
        continue;
      }

      const int next_index = lighting_local_index(next_x, next_y, next_z);
      if (passable[next_index] == 0) {
        continue;
      }

      const uint8_t next_light =
          direction.dy == -1 ? light_level : (uint8_t)(light_level > 0 ? light_level - 1 : 0);
      if (next_light <= channel[next_index]) {
        continue;
      }

      channel[next_index] = next_light;
      if (!lighting_queue_push(queue, (uint32_t)next_index)) {
        return 0;
      }
    }
  }

  return 1;
}

static inline int lighting_propagate_block_light_within_chunk(
    const uint8_t *passable, uint8_t *channel, IndexQueue *queue) {
  uint32_t queue_index = 0;
  while (queue_index < queue->length) {
    const uint32_t index = queue->data[queue_index++];
    const uint8_t light_level = channel[index];
    if (light_level <= 1) {
      continue;
    }

    int x = 0;
    int y = 0;
    int z = 0;
    lighting_local_position((int)index, &x, &y, &z);
    for (size_t direction_index = 0;
         direction_index < sizeof(LIGHT_DIRECTIONS) / sizeof(LIGHT_DIRECTIONS[0]);
         direction_index += 1) {
      const LightDirection direction = LIGHT_DIRECTIONS[direction_index];
      const int next_x = x + direction.dx;
      const int next_y = y + direction.dy;
      const int next_z = z + direction.dz;
      if (next_x < 0 || next_x >= CHUNK_SIZE || next_y < 0 || next_y >= CHUNK_HEIGHT ||
          next_z < 0 || next_z >= CHUNK_SIZE) {
        continue;
      }

      const int next_index = lighting_local_index(next_x, next_y, next_z);
      if (passable[next_index] == 0) {
        continue;
      }

      const uint8_t next_light = (uint8_t)(light_level - 1);
      if (next_light <= channel[next_index]) {
        continue;
      }

      channel[next_index] = next_light;
      if (!lighting_queue_push(queue, (uint32_t)next_index)) {
        return 0;
      }
    }
  }

  return 1;
}

static inline uint8_t lighting_get_external_direct_sky_light(
    const uint8_t *neighbor_blocks, const uint16_t *neighbor_heightmap, int local_x, int local_y,
    int local_z) {
  const int highest_occupied = neighbor_heightmap[local_x + CHUNK_SIZE * local_z];
  if (highest_occupied == 0 &&
      neighbor_blocks[lighting_local_index(local_x, 0, local_z)] == AIR_BLOCK_ID) {
    return LIGHT_LEVEL_MAX;
  }

  return local_y > highest_occupied ? LIGHT_LEVEL_MAX : 0;
}

static inline int lighting_seed_border_from_neighbor(
    const uint8_t *chunk_passable, uint8_t *sky_out, uint8_t *block_out,
    const uint8_t *neighbor_blocks, const uint8_t *neighbor_passable,
    const uint8_t *neighbor_emitted, const uint16_t *neighbor_heightmap, int dx, int dz,
    IndexQueue *sky_queue, IndexQueue *block_queue) {
  if (neighbor_blocks == NULL || neighbor_passable == NULL || neighbor_emitted == NULL ||
      neighbor_heightmap == NULL) {
    return 1;
  }

  const int local_x = dx == 1 ? CHUNK_SIZE - 1 : (dx == -1 ? 0 : -1);
  const int local_z = dz == 1 ? CHUNK_SIZE - 1 : (dz == -1 ? 0 : -1);

  for (int local_y = 0; local_y < CHUNK_HEIGHT; local_y += 1) {
    for (int edge = 0; edge < CHUNK_SIZE; edge += 1) {
      const int x = local_x >= 0 ? local_x : edge;
      const int z = local_z >= 0 ? local_z : edge;
      const int inside_index = lighting_local_index(x, local_y, z);
      if (chunk_passable[inside_index] == 0) {
        continue;
      }

      const int neighbor_x = dx == 1 ? 0 : (dx == -1 ? CHUNK_SIZE - 1 : x);
      const int neighbor_z = dz == 1 ? 0 : (dz == -1 ? CHUNK_SIZE - 1 : z);
      const int outside_index = lighting_local_index(neighbor_x, local_y, neighbor_z);

      if (neighbor_passable[outside_index] != 0) {
        const uint8_t sky_light = lighting_get_external_direct_sky_light(
            neighbor_blocks, neighbor_heightmap, neighbor_x, local_y, neighbor_z);
        if (sky_light > 1 && sky_light - 1 > sky_out[inside_index]) {
          sky_out[inside_index] = (uint8_t)(sky_light - 1);
          if (!lighting_queue_push(sky_queue, (uint32_t)inside_index)) {
            return 0;
          }
        }
      }

      const uint8_t emitted_light = neighbor_emitted[outside_index];
      if (emitted_light > 1 && emitted_light - 1 > block_out[inside_index]) {
        block_out[inside_index] = (uint8_t)(emitted_light - 1);
        if (!lighting_queue_push(block_queue, (uint32_t)inside_index)) {
          return 0;
        }
      }
    }
  }

  return 1;
}

#endif
